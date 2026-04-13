import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, In } from 'typeorm';
import { Tournament, TournamentFormat, TournamentStatus } from './entities/tournament.entity';
import { Team } from './entities/team.entity';
import { TournamentGroup } from './entities/tournament-group.entity';
import { GroupStanding } from './entities/group-standing.entity';
import { Match, MatchPhase, MatchStatus } from './entities/match.entity';
import { Player, PlayerPosition } from './entities/player.entity';
import { MatchGoal } from './entities/match-goal.entity';
import { MatchCard } from './entities/match-card.entity';
import { Venue } from './entities/venue.entity';
import {
  CreateTournamentDto,
  AddTeamDto,
  RecordResultDto,
  UpdateResultDto,
  AssignGroupsDto,
  ScheduleMatchDto,
  AddPlayerDto,
  ImportPlayersDto,
  BulkImportPlayersDto,
  UpdatePlayerDto,
  UpdatePlayerStatsDto,
  AddGoalDto,
  AddMatchCardDto,
  CreateVenueDto,
  UpdateVenueDto,
} from './dto/championship.dto';

@Injectable()
export class ChampionshipService {
  constructor(
    @InjectRepository(Tournament) private tournamentRepo: Repository<Tournament>,
    @InjectRepository(Team)       private teamRepo: Repository<Team>,
    @InjectRepository(TournamentGroup) private groupRepo: Repository<TournamentGroup>,
    @InjectRepository(GroupStanding)   private standingRepo: Repository<GroupStanding>,
    @InjectRepository(Match)           private matchRepo: Repository<Match>,
    @InjectRepository(Player)          private playerRepo: Repository<Player>,
    @InjectRepository(MatchGoal)       private matchGoalRepo: Repository<MatchGoal>,
    @InjectRepository(Venue) private venueRepo: Repository<Venue>,
    @InjectRepository(MatchCard)       private matchCardRepo: Repository<MatchCard>,
    private dataSource: DataSource,
  ) {}

  // ─── TOURNAMENTS ──────────────────────────────────────────────────────────

  async createTournament(dto: CreateTournamentDto): Promise<Tournament> {
    if (dto.format === TournamentFormat.GROUPS && !dto.groupCount) {
      throw new BadRequestException('groupCount é obrigatório para o formato GROUPS.');
    }
    const tournament = this.tournamentRepo.create({
      ...dto,
      groupCount: dto.groupCount ?? 1,
      status: TournamentStatus.DRAFT,
    });
    return this.tournamentRepo.save(tournament);
  }

  async listTournaments(): Promise<Tournament[]> {
    return this.tournamentRepo.find({ order: { createdAt: 'DESC' } });
  }

  async getTournament(id: number): Promise<Tournament> {
    const t = await this.tournamentRepo.findOne({
      where: { id },
      relations: ['teams', 'groups', 'groups.standings', 'matches'],
    });
    if (!t) throw new NotFoundException('Torneio não encontrado.');
    return t;
  }

  async deleteTournament(id: number): Promise<void> {
    await this.tournamentRepo.delete(id);
  }

  // ─── ACTIVE TOURNAMENT ────────────────────────────────────────────────────

  /** Define um torneio como ativo (desativa todos os outros) */
  async setActiveTournament(id: number): Promise<Tournament> {
    const tournament = await this._findTournament(id);

    // Desativa qualquer torneio ativo anteriormente
    await this.tournamentRepo.update({ active: true }, { active: false });

    tournament.active = true;
    return this.tournamentRepo.save(tournament);
  }

  /** Retorna o torneio atualmente ativo com todos os dados (uso público) */
  async getActiveTournament(): Promise<Tournament> {
    const tournament = await this.tournamentRepo.findOne({
      where: { active: true },
      relations: ['teams', 'groups', 'groups.standings', 'matches'],
    });
    if (!tournament) throw new NotFoundException('Nenhum torneio ativo no momento.');
    return tournament;
  }

  /**
   * Retorna torneio + standings + bracket + partidas + jogadores em uma única chamada.
   * Usado pelo frontend para evitar 5 round-trips separados.
   */
  async getActiveFull() {
  // Busca leve só para pegar o id
  const tournament = await this.tournamentRepo.findOne({
    where: { active: true },
    select: ['id', 'name', 'description', 'format', 'status',
             'teamsAdvancing', 'startDate', 'createdAt', 'active'],
  });
  if (!tournament) throw new NotFoundException('Nenhum torneio ativo no momento.');

  const id = tournament.id;

  const [standings, bracket, matches, players] = await Promise.all([
    this.getStandings(id).catch(() => []),
    this.getBracket(id).catch(() => null),
    this.getMatches(id).catch(() => []),
    this.listAllPlayers(id).catch(() => []),
  ]);

  return { tournament, standings, bracket, matches, players };
  }

  // ─── TEAMS ────────────────────────────────────────────────────────────────

  async addTeam(tournamentId: number, dto: AddTeamDto): Promise<Team> {
    const tournament = await this._findTournament(tournamentId);
    if (tournament.status !== TournamentStatus.DRAFT) {
      throw new BadRequestException('Não é possível adicionar times após o início do torneio.');
    }
    const team = this.teamRepo.create({ name: dto.name, logoUrl: dto.logoUrl ?? null, tournamentId });
    return this.teamRepo.save(team);
  }

  async updateTeamLogo(tournamentId: number, teamId: number, logoUrl: string | null): Promise<Team> {
    const team = await this.teamRepo.findOne({ where: { id: teamId, tournamentId } });
    if (!team) throw new NotFoundException('Time não encontrado.');
    team.logoUrl = logoUrl;
    return this.teamRepo.save(team);
  }

  async removeTeam(tournamentId: number, teamId: number): Promise<void> {
    const team = await this.teamRepo.findOne({ where: { id: teamId, tournamentId } });
    if (!team) throw new NotFoundException('Time não encontrado.');
    await this.teamRepo.remove(team);
  }

  async listTeams(tournamentId: number): Promise<Team[]> {
    return this.teamRepo.find({ where: { tournamentId } });
  }

  // ─── START TOURNAMENT ─────────────────────────────────────────────────────

  /**
   * Inicia o torneio gerando todos os jogos da fase inicial.
   * Para GROUPS: admin deve ter atribuído os times aos grupos via assignGroups().
   * Para LEAGUE e KNOCKOUT: os jogos são gerados automaticamente.
   */
  async startTournament(tournamentId: number): Promise<Tournament> {
    // Carrega SEM relações para evitar que save() no final sobrescreva
    // tournamentId dos grupos recém-criados com undefined (cascade bug TypeORM)
    const tournament = await this._findTournament(tournamentId, false);

    if (tournament.status !== TournamentStatus.DRAFT) {
      throw new BadRequestException('Torneio já foi iniciado.');
    }

    const teams = await this.teamRepo.find({ where: { tournamentId } });
    if (teams.length < 2) {
      throw new BadRequestException('São necessários pelo menos 2 times para iniciar o torneio.');
    }

    let newStatus: TournamentStatus;

    switch (tournament.format) {
      case TournamentFormat.GROUPS:
        await this._startGroupStage(tournament, teams);
        newStatus = TournamentStatus.GROUP_STAGE;
        break;
      case TournamentFormat.LEAGUE:
        await this._startLeagueStage(tournament, teams);
        newStatus = TournamentStatus.GROUP_STAGE;
        break;
      case TournamentFormat.KNOCKOUT:
        await this._startKnockout(tournament, teams);
        newStatus = TournamentStatus.KNOCKOUT_STAGE;
        break;
      default:
        throw new BadRequestException('Formato de torneio inválido.');
    }

    // update() só altera a coluna status, sem reescrever relações em memória
    await this.tournamentRepo.update(tournamentId, { status: newStatus! });
    return this._findTournament(tournamentId, false);
  }

  // ─── ASSIGN GROUPS (apenas GROUPS format) ─────────────────────────────────

  async assignGroups(tournamentId: number, dto: AssignGroupsDto): Promise<TournamentGroup[]> {
    const tournament = await this._findTournament(tournamentId);
    if (tournament.format !== TournamentFormat.GROUPS) {
      throw new BadRequestException('Este torneio não usa fase de grupos.');
    }
    if (tournament.status !== TournamentStatus.DRAFT) {
      throw new BadRequestException('Grupos só podem ser atribuídos antes de iniciar o torneio.');
    }

    // Remove grupos existentes e recria
    await this.groupRepo.delete({ tournamentId });

    const groupLetters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const groups: TournamentGroup[] = [];

    for (let i = 0; i < tournament.groupCount; i++) {
      const group = await this.groupRepo.save(
        this.groupRepo.create({ name: `Grupo ${groupLetters[i]}`, tournamentId }),
      );
      groups.push(group);
    }

    // Cria standings para cada time no seu grupo
    for (const { teamId, groupIndex } of dto.assignments) {
      if (groupIndex >= groups.length) {
        throw new BadRequestException(`Índice de grupo inválido: ${groupIndex}`);
      }
      await this.standingRepo.save(
        this.standingRepo.create({ groupId: groups[groupIndex].id, teamId }),
      );
    }

    return this.groupRepo.find({
      where: { tournamentId },
      relations: ['standings', 'standings.team'],
    });
  }

  // ─── MATCH GOALS ──────────────────────────────────────────────────────────

  async getMatchGoals(matchId: number): Promise<MatchGoal[]> {
    return this.matchGoalRepo.find({
      where: { matchId },
      relations: ['player', 'team'],
      order: { id: 'ASC' },
    });
  }

  async addGoal(matchId: number, dto: AddGoalDto): Promise<MatchGoal> {
    if (!dto.ownGoal && !dto.playerId) throw new BadRequestException('playerId é obrigatório quando não é gol contra.');
    if (!dto.teamId) throw new BadRequestException('teamId é obrigatório.');

    const match = await this.matchRepo.findOne({ where: { id: matchId } });
    if (!match) throw new NotFoundException('Partida não encontrada.');

    let player: Player | null = null;
    if (dto.playerId) {
      player = await this.playerRepo.findOne({ where: { id: dto.playerId } });
      if (!player) throw new NotFoundException(`Jogador ${dto.playerId} não encontrado.`);
    }

    const goal = await this.matchGoalRepo.save(
      this.matchGoalRepo.create({
        matchId,
        playerId: dto.playerId ?? null,
        teamId: dto.teamId,
        ownGoal: dto.ownGoal ?? false,
      }),
    );

    // Se a partida já está finalizada e há jogador, incrementa imediatamente
    if (match.status === MatchStatus.FINISHED && player) {
      player.goals = Math.max(0, player.goals + 1);
      await this.playerRepo.save(player);
    }

    return this.matchGoalRepo.findOne({
      where: { id: goal.id },
      relations: ['player', 'team'],
    }) as Promise<MatchGoal>;
  }

  async patchGoal(matchId: number, goalId: number, playerId: number | null): Promise<MatchGoal> {
    const goal = await this.matchGoalRepo.findOne({ where: { id: goalId, matchId } });
    if (!goal) throw new NotFoundException('Evento de gol não encontrado.');
    if (goal.ownGoal) throw new BadRequestException('Gol contra não pode ter jogador atribuído.');

    const match = await this.matchRepo.findOne({ where: { id: matchId } });

    // Se partida finalizada: ajusta stats do jogador anterior e do novo
    if (match?.status === MatchStatus.FINISHED) {
      if (goal.playerId) {
        const prev = await this.playerRepo.findOne({ where: { id: goal.playerId } });
        if (prev) { prev.goals = Math.max(0, prev.goals - 1); await this.playerRepo.save(prev); }
      }
      if (playerId) {
        const next = await this.playerRepo.findOne({ where: { id: playerId } });
        if (next) { next.goals = Math.max(0, next.goals + 1); await this.playerRepo.save(next); }
      }
    }

    goal.playerId = playerId;
    await this.matchGoalRepo.save(goal);

    return this.matchGoalRepo.findOne({
      where: { id: goal.id },
      relations: ['player', 'team'],
    }) as Promise<MatchGoal>;
  }

  async removeGoal(matchId: number, goalId: number): Promise<void> {
    const goal = await this.matchGoalRepo.findOne({ where: { id: goalId, matchId } });
    if (!goal) throw new NotFoundException('Evento de gol não encontrado.');

    const match = await this.matchRepo.findOne({ where: { id: matchId } });

    // Se a partida já está finalizada e o gol tem jogador (não é gol contra), decrementa
    if (match?.status === MatchStatus.FINISHED && !goal.ownGoal && goal.playerId) {
      const player = await this.playerRepo.findOne({ where: { id: goal.playerId } });
      if (player) {
        player.goals = Math.max(0, player.goals - 1);
        await this.playerRepo.save(player);
      }
    }

    await this.matchGoalRepo.delete(goalId);
  }

  // ─── RECORD RESULT ────────────────────────────────────────────────────────

  async recordResult(matchId: number, dto: RecordResultDto): Promise<Match | null> {
    const match = await this.matchRepo.findOne({ where: { id: matchId } });
    if (!match) throw new NotFoundException('Partida não encontrada.');
    if (match.status === MatchStatus.FINISHED) {
      throw new BadRequestException('Esta partida já tem resultado registrado.');
    }
    if (!match.homeTeamId || !match.awayTeamId) {
      throw new BadRequestException('Esta partida ainda não tem os dois times definidos.');
    }

    match.homeScore     = dto.homeScore;
    match.awayScore     = dto.awayScore;
    match.homePenalties = dto.homePenalties ?? null;
    match.awayPenalties = dto.awayPenalties ?? null;
    match.status        = MatchStatus.FINISHED;

    await this.matchRepo.save(match);

    // Limpa suspensões cumpridas nesta partida, depois aplica stats e novas suspensões
    await this._clearServedSuspensions(matchId);
    await this._applyGoalStats(matchId, 1);
    await this._applyCardStats(matchId, 1);

    if (match.phase === MatchPhase.GROUP) {
      await this._updateGroupStanding(match);
    } else {
      await this._advanceKnockoutWinner(match);
    }

    return this.matchRepo.findOne({ where: { id: matchId } });
  }

  // ─── DELETE RESULT (cancelar resultado) ──────────────────────────────────

  async deleteResult(matchId: number): Promise<Match> {
    const match = await this.matchRepo.findOne({ where: { id: matchId } });
    if (!match) throw new NotFoundException('Partida não encontrada.');
    if (match.status !== MatchStatus.FINISHED) {
      throw new BadRequestException('Esta partida não tem resultado registrado.');
    }

    // Mata-mata: impede reset se a próxima partida já tiver resultado
    if (match.phase !== MatchPhase.GROUP && match.nextMatchId) {
      const nextMatch = await this.matchRepo.findOne({ where: { id: match.nextMatchId } });
      if (nextMatch?.status === MatchStatus.FINISHED) {
        throw new BadRequestException(
          'Não é possível cancelar este resultado pois a partida seguinte já foi disputada.',
        );
      }
      // Remove o vencedor do slot na próxima partida
      if (nextMatch) {
        if (match.nextMatchSlot === 'home') nextMatch.homeTeamId = null;
        else                                nextMatch.awayTeamId = null;
        await this.matchRepo.save(nextMatch);
      }
    }

    // Fase de grupos: reverte standings
    if (match.phase === MatchPhase.GROUP) {
      await this._revertGroupStanding(match, match.homeScore!, match.awayScore!);
    }

    // Coleta jogadores com cartões nesta partida (antes de deletar)
    const cardsInMatch = await this.matchCardRepo.find({ where: { matchId } });
    const affectedPlayerIds = [...new Set(cardsInMatch.map(c => c.playerId))];

    // Reverte gols e cartões dos jogadores
    await this._applyGoalStats(matchId, -1);
    await this._applyCardStats(matchId, -1);

    match.homeScore     = null;
    match.awayScore     = null;
    match.homePenalties = null;
    match.awayPenalties = null;
    match.status        = MatchStatus.SCHEDULED;
    await this.matchRepo.save(match);

    // Recomputa suspensão com base no histórico RESTANTE (partida já está SCHEDULED)
    for (const playerId of affectedPlayerIds) {
      await this._recomputePlayerSuspension(playerId);
    }

    return this.matchRepo.findOne({ where: { id: matchId } }) as Promise<Match>;
  }

  // ─── UPDATE RESULT (correção de placar) ──────────────────────────────────

  async updateResult(matchId: number, dto: UpdateResultDto): Promise<Match | null> {
    const match = await this.matchRepo.findOne({ where: { id: matchId } });
    if (!match) throw new NotFoundException('Partida não encontrada.');
    if (match.status !== MatchStatus.FINISHED) {
      throw new BadRequestException('Esta partida ainda não tem resultado — use POST para registrar.');
    }

    const oldHomeScore = match.homeScore;
    const oldAwayScore = match.awayScore;

    match.homeScore     = dto.homeScore;
    match.awayScore     = dto.awayScore;
    match.homePenalties = dto.homePenalties ?? null;
    match.awayPenalties = dto.awayPenalties ?? null;

    await this.matchRepo.save(match);

    // Recalcula a tabela se for jogo de grupo
    if (match.phase === MatchPhase.GROUP) {
      await this._revertGroupStanding(match, oldHomeScore!, oldAwayScore!);
      await this._updateGroupStanding(match);
    }

    // No mata-mata, reatribui o vencedor na próxima partida
    if (match.phase !== MatchPhase.GROUP) {
      await this._advanceKnockoutWinner(match);
    }

    return this.matchRepo.findOne({ where: { id: matchId } });
  }

  /** Desfaz o impacto de um resultado anterior na tabela de grupos */
  private async _revertGroupStanding(
    match: Match,
    oldHomeScore: number,
    oldAwayScore: number,
  ) {
    if (!match.homeTeamId || !match.awayTeamId || !match.groupId) return;

    const home = await this.standingRepo.findOne({
      where: { teamId: match.homeTeamId, groupId: match.groupId },
    });
    const away = await this.standingRepo.findOne({
      where: { teamId: match.awayTeamId, groupId: match.groupId },
    });

    if (!home || !away) return;

    home.played--; away.played--;
    home.goalsFor     -= oldHomeScore;
    home.goalsAgainst -= oldAwayScore;
    away.goalsFor     -= oldAwayScore;
    away.goalsAgainst -= oldHomeScore;

    if (oldHomeScore > oldAwayScore) {
      home.wins--;   home.points -= 3;
      away.losses--;
    } else if (oldHomeScore < oldAwayScore) {
      away.wins--;   away.points -= 3;
      home.losses--;
    } else {
      home.draws--; home.points -= 1;
      away.draws--; away.points -= 1;
    }

    await this.standingRepo.save([home, away]);
  }

  async advanceToKnockout(tournamentId: number): Promise<Match[]> {
    const tournament = await this._findTournament(tournamentId, true);

    if (tournament.status !== TournamentStatus.GROUP_STAGE) {
      throw new BadRequestException('O torneio não está na fase de grupos/liga.');
    }

    // Verifica se todos os jogos da fase inicial estão concluídos
    const pending = await this.matchRepo.count({
      where: { tournamentId, phase: MatchPhase.GROUP, status: MatchStatus.SCHEDULED },
    });
    if (pending > 0) {
      throw new BadRequestException(`Ainda existem ${pending} partidas sem resultado na fase inicial.`);
    }

    const advancingTeams = await this._getAdvancingTeams(tournament);

    if (advancingTeams.length < 2) {
      throw new BadRequestException('Times insuficientes para a fase mata-mata.');
    }

    const knockoutMatches = await this._startKnockout(tournament, advancingTeams);

    // update() direto evita cascade das relações em memória
    await this.tournamentRepo.update(tournamentId, { status: TournamentStatus.KNOCKOUT_STAGE });

    // Zera acumulação de amarelos ao entrar no mata-mata (suspensões ativas são mantidas)
    await this.playerRepo.update({ tournamentId }, { yellowCardAccum: 0 });

    return knockoutMatches;
  }

  // ─── BRACKET ──────────────────────────────────────────────────────────────

  async getBracket(tournamentId: number) {
    const knockoutPhases = [
      MatchPhase.ROUND_OF_16,
      MatchPhase.QUARTER_FINAL,
      MatchPhase.SEMI_FINAL,
      MatchPhase.FINAL,
    ];

    // ✅ 1 query só, em vez de 4 sequenciais
    const allMatches = await this.matchRepo.find({
      where: { tournamentId, phase: In(knockoutPhases) },
      order: { id: 'ASC' },
    });

    // Agrupa por fase em memória
    const byPhase = new Map<MatchPhase, typeof allMatches>();
    for (const m of allMatches) {
      if (!byPhase.has(m.phase)) byPhase.set(m.phase, []);
      byPhase.get(m.phase)!.push(m);
    }

    const phaseLabels: Record<MatchPhase, string> = {
      [MatchPhase.GROUP]:         'Fase de Grupos',
      [MatchPhase.ROUND_OF_16]:   'Oitavas de Final',
      [MatchPhase.QUARTER_FINAL]: 'Quartas de Final',
      [MatchPhase.SEMI_FINAL]:    'Semifinal',
      [MatchPhase.FINAL]:         'Final',
    };

    const rounds = knockoutPhases
      .filter(phase => byPhase.has(phase))
      .map(phase => ({
        phase,
        label: phaseLabels[phase],
        matches: byPhase.get(phase)!.map((m) => ({
          id:            m.id,
          status:        m.status,
          homeTeam:      m.homeTeam  ? { id: m.homeTeam.id,  name: m.homeTeam.name,  logoUrl: m.homeTeam.logoUrl  ?? null } : null,
          awayTeam:      m.awayTeam  ? { id: m.awayTeam.id,  name: m.awayTeam.name,  logoUrl: m.awayTeam.logoUrl  ?? null } : null,
          homeScore:     m.homeScore,
          awayScore:     m.awayScore,
          homePenalties: m.homePenalties,
          awayPenalties: m.awayPenalties,
          winner:        this._getWinner(m),
        })),
      }));

    return { tournamentId, rounds };
  }

  // ─── STANDINGS ────────────────────────────────────────────────────────────

  async getStandings(tournamentId: number) {
    const groups = await this.groupRepo.find({
      where: { tournamentId },
      relations: ['standings', 'standings.team'],
    });

    const players = await this.playerRepo.find({ where: { tournamentId } });
    const cardMap = new Map<number, { yellow: number; red: number }>();
    for (const p of players) {
      const cur = cardMap.get(p.teamId) ?? { yellow: 0, red: 0 };
      cardMap.set(p.teamId, { yellow: cur.yellow + p.yellowCards, red: cur.red + p.redCards });
    }

    // Carrega partidas de grupo finalizadas para confronto direto
    const groupMatches = await this.matchRepo.find({
      where: { tournamentId, phase: MatchPhase.GROUP, status: MatchStatus.FINISHED },
    });

    return groups.map((g) => ({
      group:     g.name,
      standings: this._sortStandings(g.standings, cardMap, groupMatches).map((s, i) => ({
        position:      i + 1,
        team:          s.team.name,
        teamLogo:      s.team.logoUrl ?? null,
        teamId:        s.teamId,
        played:        s.played,
        wins:          s.wins,
        draws:         s.draws,
        losses:        s.losses,
        goalsFor:      s.goalsFor,
        goalsAgainst:  s.goalsAgainst,
        goalDiff:      s.goalsFor - s.goalsAgainst,
        points:        s.points,
        yellowCards:   cardMap.get(s.teamId)?.yellow ?? 0,
        redCards:      cardMap.get(s.teamId)?.red    ?? 0,
      })),
    }));
  }

  async getMatches(tournamentId: number, phase?: MatchPhase) {
    const where: any = { tournamentId };
    if (phase) where.phase = phase;
    const matches = await this.matchRepo.find({
      where,
      relations: ['venue'],
      order: { scheduledAt: 'ASC', round: 'ASC', id: 'ASC' },
    });
    return matches.map((m) => ({
      id:             m.id,
      phase:          m.phase,
      status:         m.status,
      round:          m.round,
      scheduledAt:    m.scheduledAt ?? null,
      homeTeam:       m.homeTeam  ? { id: m.homeTeam.id,  name: m.homeTeam.name,  logoUrl: m.homeTeam.logoUrl  ?? null } : null,
      awayTeam:       m.awayTeam  ? { id: m.awayTeam.id,  name: m.awayTeam.name,  logoUrl: m.awayTeam.logoUrl  ?? null } : null,
      homeScore:      m.homeScore,
      awayScore:      m.awayScore,
      homePenalties:  m.homePenalties,
      awayPenalties:  m.awayPenalties,
      hasSumula:      !!m.sumulaUrl,
      venueId:        m.venueId ?? null,
      venue:          m.venue ? {
        id:       m.venue.id,
        name:     m.venue.name,
        city:     m.venue.city     ?? null,
        address:  m.venue.address  ?? null,
        mapUrl:   m.venue.mapUrl   ?? null,
        capacity: m.venue.capacity ?? null,
      } : null,
    }));
  }

  async getMatchDetail(matchId: number) {
    const match = await this.matchRepo.findOne({ where: { id: matchId } });
    if (!match) throw new NotFoundException('Partida não encontrada.');

    const [goals, cards] = await Promise.all([
      this.matchGoalRepo.find({ where: { matchId }, relations: ['player', 'team'], order: { id: 'ASC' } }),
      this.matchCardRepo.find({ where: { matchId }, relations: ['player', 'team'], order: { id: 'ASC' } }),
    ]);

    return {
      sumulaUrl: match.sumulaUrl ?? null,
      goals: goals.map(g => ({
        id:       g.id,
        teamId:   g.teamId,
        teamName: g.team?.name ?? null,
        player:   g.player ? { id: g.player.id, name: g.player.name, number: g.player.number, birthDate: g.player.birthDate ?? null } : null,
        ownGoal:  g.ownGoal,
      })),
      cards: cards.map(c => ({
        id:       c.id,
        teamId:   c.teamId,
        teamName: c.team?.name ?? null,
        type:     c.type,
        player:   c.player ? { id: c.player.id, name: c.player.name, number: c.player.number, birthDate: c.player.birthDate ?? null } : null,
      })),
    };
  }

  async uploadSumula(matchId: number, sumulaUrl: string | null): Promise<void> {
    const match = await this.matchRepo.findOne({ where: { id: matchId } });
    if (!match) throw new NotFoundException('Partida não encontrada.');
    match.sumulaUrl = sumulaUrl;
    await this.matchRepo.save(match);
  }


  async scheduleMatch(matchId: number, dto: ScheduleMatchDto): Promise<Match> {
    const match = await this.matchRepo.findOne({ where: { id: matchId } });
    if (!match) throw new NotFoundException('Partida não encontrada.');

    // Monta apenas as colunas que realmente mudaram
    const patch: Partial<{ scheduledAt: Date | null; venueId: number | null }> = {};

    if (dto.scheduledAt !== undefined) {
      patch.scheduledAt = dto.scheduledAt ? new Date(dto.scheduledAt) : null;
    }

    if (dto.venueId !== undefined) {
      if (dto.venueId === null) {
        patch.venueId = null;
      } else {
        const venue = await this.venueRepo.findOne({
          where: { id: dto.venueId, tournamentId: match.tournamentId },
        });
        if (!venue) throw new NotFoundException('Local não encontrado neste torneio.');
        patch.venueId = venue.id;
      }
    }

    // UPDATE cirúrgico — só altera as colunas do patch, sem tocar nas demais
    if (Object.keys(patch).length > 0) {
      await this.matchRepo.update(matchId, patch);
    }

    // Retorna o match atualizado com a relação venue carregada
    return this.matchRepo.findOne({
      where: { id: matchId },
      relations: ['venue'],
    }) as Promise<Match>;
  }


  // ─── PLAYERS ──────────────────────────────────────────────────────────────

  async listPlayers(tournamentId: number, teamId: number): Promise<Player[]> {
    return this.playerRepo.find({
      where: { tournamentId, teamId },
      order: { number: 'ASC', name: 'ASC' },
    });
  }

  async listAllPlayers(tournamentId: number): Promise<Player[]> {
    return this.playerRepo.find({
      where: { tournamentId },
      relations: ['team'],
      order: { goals: 'DESC', yellowCards: 'ASC', name: 'ASC' },
    });
  }

  async addPlayer(tournamentId: number, teamId: number, dto: AddPlayerDto): Promise<Player> {
    const team = await this.teamRepo.findOne({ where: { id: teamId, tournamentId } });
    if (!team) throw new NotFoundException('Time nao encontrado neste torneio.');
    const player = this.playerRepo.create({
      name: dto.name, number: dto.number ?? null,
      position: (dto.position as PlayerPosition) ?? null,
      goals: 0, yellowCards: 0, redCards: 0,
      teamId, tournamentId,
    });
    return this.playerRepo.save(player);
  }

  async importPlayers(tournamentId: number, teamId: number, dto: ImportPlayersDto): Promise<Player[]> {
    const team = await this.teamRepo.findOne({ where: { id: teamId, tournamentId } });
    if (!team) throw new NotFoundException('Time nao encontrado neste torneio.');
    await this.playerRepo.delete({ teamId, tournamentId });
    const players = dto.players.map((p) =>
      this.playerRepo.create({
        name: p.name, number: p.number ?? null,
        position: (p.position as PlayerPosition) ?? null,
        goals: 0, yellowCards: 0, redCards: 0,
        teamId, tournamentId,
      }),
    );
    return this.playerRepo.save(players);
  }

  /** Importação por texto — "Nome;Número;Posição", substitui o elenco atual */
  async bulkImportByLines(tournamentId: number, teamId: number, dto: BulkImportPlayersDto): Promise<Player[]> {
    const team = await this.teamRepo.findOne({ where: { id: teamId, tournamentId } });
    if (!team) throw new NotFoundException('Time não encontrado neste torneio.');

    const positionMap: Record<string, PlayerPosition> = {
      GK:  PlayerPosition.GOALKEEPER,
      DEF: PlayerPosition.DEFENDER,
      MID: PlayerPosition.MIDFIELDER,
      FWD: PlayerPosition.FORWARD,
    };

    const players = dto.lines
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line) => {
        const [name, numberStr, posStr] = line.split(';').map((s) => s.trim());
        const parsed = numberStr ? parseInt(numberStr, 10) : NaN;
        const number   = isNaN(parsed) ? null : parsed;
        const position = posStr ? (positionMap[posStr.toUpperCase()] ?? null) : null;
        return this.playerRepo.create({ name, number, position, goals: 0, yellowCards: 0, redCards: 0, teamId, tournamentId });
      });

    await this.playerRepo.delete({ teamId, tournamentId });
    return this.playerRepo.save(players);
  }

  async updatePlayer(playerId: number, dto: UpdatePlayerDto): Promise<Player> {
    const player = await this.playerRepo.findOne({ where: { id: playerId } });
    if (!player) throw new NotFoundException('Jogador não encontrado.');
    if (dto.name      !== undefined) player.name      = dto.name;
    if (dto.number    !== undefined) player.number    = dto.number;
    if (dto.position  !== undefined) player.position  = dto.position;
    if (dto.birthDate !== undefined) player.birthDate = dto.birthDate ? new Date(dto.birthDate) : null;
    return this.playerRepo.save(player);
  }

  async removePlayer(playerId: number): Promise<void> {
    const player = await this.playerRepo.findOne({ where: { id: playerId } });
    if (!player) throw new NotFoundException('Jogador nao encontrado.');
    await this.playerRepo.delete(playerId);
  }

  async updatePlayerStats(playerId: number, dto: UpdatePlayerStatsDto): Promise<Player> {
    const player = await this.playerRepo.findOne({ where: { id: playerId } });
    if (!player) throw new NotFoundException('Jogador nao encontrado.');
    if (dto.goals       !== undefined) player.goals       = Math.max(0, dto.goals);
    if (dto.yellowCards !== undefined) player.yellowCards  = Math.max(0, dto.yellowCards);
    if (dto.redCards    !== undefined) player.redCards     = Math.max(0, dto.redCards);
    return this.playerRepo.save(player);
  }

  async incrementStat(playerId: number, stat: 'goals' | 'yellowCards' | 'redCards', delta: 1 | -1 = 1): Promise<Player> {
    const player = await this.playerRepo.findOne({ where: { id: playerId } });
    if (!player) throw new NotFoundException('Jogador nao encontrado.');
    player[stat] = Math.max(0, player[stat] + delta);
    return this.playerRepo.save(player);
  }

  /** Limpa manualmente a suspensão de um jogador (override do admin) */
  async clearPlayerSuspension(playerId: number): Promise<Player> {
    const player = await this.playerRepo.findOne({ where: { id: playerId } });
    if (!player) throw new NotFoundException('Jogador não encontrado.');
    player.suspended = false;
    player.yellowCardAccum = 0;
    return this.playerRepo.save(player);
  }

  // ─── PRIVATE HELPERS ──────────────────────────────────────────────────────

  /**
   * Agrupa os gols salvos por jogador e aplica delta (+1 ao salvar, -1 ao cancelar).
   * Nunca deixa player.goals ficar negativo.
   */
  private async _applyGoalStats(matchId: number, delta: 1 | -1): Promise<void> {
    const goals = await this.matchGoalRepo.find({ where: { matchId } });
    const countByPlayer = new Map<number, number>();
    for (const g of goals) {
      if (g.ownGoal || !g.playerId) continue;  // gol contra não conta para stats do jogador
      countByPlayer.set(g.playerId, (countByPlayer.get(g.playerId) ?? 0) + 1);
    }
    const entries = Array.from(countByPlayer.entries());
    for (const [playerId, count] of entries) {
      const player = await this.playerRepo.findOne({ where: { id: playerId } });
      if (player) {
        player.goals = Math.max(0, player.goals + delta * count);
        await this.playerRepo.save(player);
      }
    }
  }

  // ─── MATCH CARDS ──────────────────────────────────────────────────────────

  async getMatchCards(matchId: number): Promise<MatchCard[]> {
    return this.matchCardRepo.find({
      where: { matchId },
      relations: ['player', 'team'],
      order: { id: 'ASC' },
    });
  }

  async addMatchCard(matchId: number, dto: AddMatchCardDto): Promise<MatchCard> {
    const match  = await this.matchRepo.findOne({ where: { id: matchId } });
    if (!match) throw new NotFoundException('Partida não encontrada.');
    const player = await this.playerRepo.findOne({ where: { id: dto.playerId } });
    if (!player) throw new NotFoundException(`Jogador ${dto.playerId} não encontrado.`);

    const card = await this.matchCardRepo.save(
      this.matchCardRepo.create({ matchId, playerId: dto.playerId, teamId: dto.teamId, type: dto.type }),
    );

    // Se partida já finalizada, aplica stat e suspensão imediatamente
    if (match.status === MatchStatus.FINISHED) {
      const stat = dto.type === 'YELLOW' ? 'yellowCards' : 'redCards';
      player[stat] = Math.max(0, player[stat] + 1);

      if (dto.type === 'RED') {
        player.suspended = true;
      } else {
        player.yellowCardAccum += 1;
        if (player.yellowCardAccum >= 3) {
          player.suspended = true;
          player.yellowCardAccum = 0;
        }
      }
      await this.playerRepo.save(player);
    }

    return this.matchCardRepo.findOne({
      where: { id: card.id },
      relations: ['player', 'team'],
    }) as Promise<MatchCard>;
  }

  async removeMatchCard(matchId: number, cardId: number): Promise<void> {
    const card = await this.matchCardRepo.findOne({ where: { id: cardId, matchId } });
    if (!card) throw new NotFoundException('Evento de cartão não encontrado.');

    const match = await this.matchRepo.findOne({ where: { id: matchId } });

    await this.matchCardRepo.delete(cardId);

    // Se partida já finalizada, decrementa stat e recomputa suspensão
    if (match?.status === MatchStatus.FINISHED) {
      const player = await this.playerRepo.findOne({ where: { id: card.playerId } });
      if (player) {
        const stat = card.type === 'YELLOW' ? 'yellowCards' : 'redCards';
        player[stat] = Math.max(0, player[stat] - 1);
        await this.playerRepo.save(player);
        // Recalcula suspensão a partir do histórico real (cartão já foi deletado acima)
        await this._recomputePlayerSuspension(card.playerId);
      }
    }
  }

  /**
   * Agrupa os cartões por jogador/tipo e aplica delta (+1 ao salvar, -1 ao cancelar).
   * Quando delta=1 também calcula suspensão (pendurado / suspenso).
   */
  private async _applyCardStats(matchId: number, delta: 1 | -1): Promise<void> {
    const cards = await this.matchCardRepo.find({ where: { matchId } });

    // Conta yellows e reds por jogador
    const yellowsMap = new Map<number, number>();
    const redsMap    = new Map<number, number>();
    for (const c of cards) {
      if (c.type === 'YELLOW') yellowsMap.set(c.playerId, (yellowsMap.get(c.playerId) ?? 0) + 1);
      else                     redsMap.set(c.playerId,    (redsMap.get(c.playerId)    ?? 0) + 1);
    }

    const allIds = new Set([...yellowsMap.keys(), ...redsMap.keys()]);

    for (const playerId of allIds) {
      const player = await this.playerRepo.findOne({ where: { id: playerId } });
      if (!player) continue;

      const yellows = yellowsMap.get(playerId) ?? 0;
      const reds    = redsMap.get(playerId)    ?? 0;

      player.yellowCards = Math.max(0, player.yellowCards + delta * yellows);
      player.redCards    = Math.max(0, player.redCards    + delta * reds);

      // Lógica de suspensão — só aplicada ao finalizar (delta=1)
      if (delta === 1) {
        if (reds > 0) {
          player.suspended = true; // vermelho → suspenso; não afeta yellowCardAccum
        }
        player.yellowCardAccum += yellows;
        if (player.yellowCardAccum >= 3) {
          player.suspended = true;
          player.yellowCardAccum = 0; // reset do ciclo — contagem recomeça
        }
      }

      await this.playerRepo.save(player);
    }
  }

  /**
   * Limpa a suspensão dos jogadores das duas equipes desta partida
   * (eles cumpriram a suspensão nesta rodada).
   * Deve ser chamado ANTES de _applyCardStats para que novas suspensões
   * ganhas nesta partida não sejam apagadas.
   */
  private async _clearServedSuspensions(matchId: number): Promise<void> {
    const match = await this.matchRepo.findOne({ where: { id: matchId } });
    if (!match?.homeTeamId || !match?.awayTeamId) return;
    await this.playerRepo.update(
      { teamId: In([match.homeTeamId, match.awayTeamId]), suspended: true },
      { suspended: false },
    );
  }

  /**
   * Recalcula yellowCardAccum e suspended de um jogador simulando todas as partidas
   * FINALIZADAS do time em ordem cronológica — usado ao remover cartões ou cancelar resultados.
   */
  private async _recomputePlayerSuspension(playerId: number): Promise<void> {
    const player = await this.playerRepo.findOne({ where: { id: playerId } });
    if (!player) return;

    // Todas as partidas FINALIZADAS do time, em ordem de ID (proxy de ordem cronológica)
    const teamMatches = await this.matchRepo.find({
      where: [
        { homeTeamId: player.teamId, status: MatchStatus.FINISHED },
        { awayTeamId: player.teamId, status: MatchStatus.FINISHED },
      ],
      order: { id: 'ASC' },
    });

    let yellowAccum = 0;
    let suspended   = false;
    let phaseGroup: 'group' | 'knockout' | null = null;

    for (const match of teamMatches) {
      const pg = match.phase === MatchPhase.GROUP ? 'group' : 'knockout';

      // Transição de fase: zera acumulação de amarelos
      if (phaseGroup && phaseGroup !== pg) yellowAccum = 0;
      phaseGroup = pg;

      // Início da partida: jogador suspenso cumpre a suspensão
      if (suspended) suspended = false;

      // Cartões deste jogador nesta partida
      const matchCards = await this.matchCardRepo.find({ where: { matchId: match.id, playerId } });
      const hasRed = matchCards.some(c => c.type === 'RED');
      const yellows = matchCards.filter(c => c.type === 'YELLOW').length;

      if (hasRed) suspended = true;
      yellowAccum += yellows;
      if (yellowAccum >= 3) { suspended = true; yellowAccum = 0; }
    }

    player.yellowCardAccum = yellowAccum;
    player.suspended       = suspended;
    await this.playerRepo.save(player);
  }

  private async _findTournament(id: number, withRelations = false): Promise<Tournament> {
    const t = await this.tournamentRepo.findOne({
      where: { id },
      relations: withRelations ? ['teams', 'groups', 'groups.standings'] : [],
    });
    if (!t) throw new NotFoundException('Torneio não encontrado.');
    return t;
  }

  /** Gera todos os jogos da fase de grupos (round-robin dentro de cada grupo) */
  private async _startGroupStage(tournament: Tournament, allTeams: Team[]) {
    const groups = await this.groupRepo.find({
      where: { tournamentId: tournament.id },
      relations: ['standings'],
    });

    if (!groups.length) {
      throw new BadRequestException('Atribua os times aos grupos antes de iniciar (POST /assign-groups).');
    }

    for (const group of groups) {
      const teamIds = group.standings.map((s) => s.teamId);
      const teams   = allTeams.filter((t) => teamIds.includes(t.id));
      await this._generateRoundRobin(tournament.id, teams, MatchPhase.GROUP, group.id);
    }
  }

  /** Liga única — todos contra todos sem grupos */
  private async _startLeagueStage(tournament: Tournament, teams: Team[]) {
    // Cria um único "grupo" para a classificação geral
    const group = await this.groupRepo.save(
      this.groupRepo.create({ name: 'Liga', tournamentId: tournament.id }),
    );
    for (const team of teams) {
      await this.standingRepo.save(
        this.standingRepo.create({ groupId: group.id, teamId: team.id }),
      );
    }
    await this._generateRoundRobin(tournament.id, teams, MatchPhase.GROUP, group.id);
  }

  /** Gera todos os confrontos round-robin para uma lista de times */
  private async _generateRoundRobin(
    tournamentId: number,
    teams: Team[],
    phase: MatchPhase,
    groupId: number | null,
  ) {
    let round = 1;
    for (let i = 0; i < teams.length - 1; i++) {
      for (let j = i + 1; j < teams.length; j++) {
        await this.matchRepo.save(
          this.matchRepo.create({
            tournamentId,
            phase,
            groupId,
            round,
            homeTeamId: teams[i].id,
            awayTeamId: teams[j].id,
          }),
        );
        round++;
      }
    }
  }

  /** Gera o bracket mata-mata para uma lista de times */
  private async _startKnockout(tournament: Tournament, teams: Team[]): Promise<Match[]> {
    const count = teams.length;
    const firstPhase = this._firstKnockoutPhase(count);

    // Garante potência de 2 (preenche com BYE implícito se necessário)
    const bracketSize = this._nextPowerOf2(count);

    // Seed: 1º vs último, 2º vs penúltimo...
    const seeded = this._seedTeams(teams, bracketSize);

    // Cria todas as partidas de todas as fases como placeholders
    const phases = this._knockoutPhaseSequence(firstPhase);
    const allMatches: Match[][] = [];

    for (let phaseIdx = 0; phaseIdx < phases.length; phaseIdx++) {
      const phase       = phases[phaseIdx];
      const matchCount  = Math.pow(2, phases.length - 1 - phaseIdx);
      const phaseMatches: Match[] = [];

      for (let i = 0; i < matchCount; i++) {
        const m = await this.matchRepo.save(
          this.matchRepo.create({
            tournamentId: tournament.id,
            phase,
            round: i + 1,
            homeTeamId: null,
            awayTeamId: null,
          }),
        );
        phaseMatches.push(m);
      }
      allMatches.push(phaseMatches);
    }

    // Preenche a primeira fase com os times seeded
    const firstPhaseMatches = allMatches[0];
    for (let i = 0; i < firstPhaseMatches.length; i++) {
      const home = seeded[i * 2];
      const away = seeded[i * 2 + 1];
      firstPhaseMatches[i].homeTeamId = home?.id ?? null;
      firstPhaseMatches[i].awayTeamId = away?.id ?? null;

      // Se um dos slots for null (BYE), avança automaticamente
      if (!home || !away) {
        const winnerId = (home ?? away)?.id ?? null;
        firstPhaseMatches[i].status = MatchStatus.FINISHED;
        firstPhaseMatches[i].homeScore = home ? 1 : 0;
        firstPhaseMatches[i].awayScore = away ? 1 : 0;
        // Avança direto para próxima fase
        if (winnerId && allMatches[1]) {
          await this._assignToNextMatch(allMatches[1], i, winnerId);
        }
      }

      await this.matchRepo.save(firstPhaseMatches[i]);
    }

    // Vincula nextMatchId entre as fases
    for (let phaseIdx = 0; phaseIdx < allMatches.length - 1; phaseIdx++) {
      const current = allMatches[phaseIdx];
      const next    = allMatches[phaseIdx + 1];
      for (let i = 0; i < current.length; i++) {
        const nextMatch = next[Math.floor(i / 2)];
        current[i].nextMatchId   = nextMatch.id;
        current[i].nextMatchSlot = i % 2 === 0 ? 'home' : 'away';
        await this.matchRepo.save(current[i]);
      }
    }

    return allMatches.flat();
  }

  /** Atualiza a tabela de classificação após um jogo de grupo */
  private async _updateGroupStanding(match: Match) {
    if (!match.homeTeamId || !match.awayTeamId || !match.groupId) return;
    if (match.homeScore === null || match.awayScore === null) return;

    const home = await this.standingRepo.findOne({
      where: { teamId: match.homeTeamId, groupId: match.groupId },
    });
    const away = await this.standingRepo.findOne({
      where: { teamId: match.awayTeamId, groupId: match.groupId },
    });

    if (!home || !away) return;

    const homeScore = match.homeScore;
    const awayScore = match.awayScore;

    home.played++; away.played++;
    home.goalsFor     += homeScore;
    home.goalsAgainst += awayScore;
    away.goalsFor     += awayScore;
    away.goalsAgainst += homeScore;

    if (homeScore > awayScore) {
      home.wins++;   home.points += 3;
      away.losses++;
    } else if (homeScore < awayScore) {
      away.wins++;   away.points += 3;
      home.losses++;
    } else {
      home.draws++; home.points += 1;
      away.draws++; away.points += 1;
    }

    await this.standingRepo.save([home, away]);
  }

  /** Avança o vencedor de uma partida mata-mata para a próxima */
  private async _advanceKnockoutWinner(match: Match) {
    if (!match.nextMatchId) return;

    const winnerId = this._getWinnerId(match);
    if (!winnerId) return;

    const nextMatch = await this.matchRepo.findOne({ where: { id: match.nextMatchId } });
    if (!nextMatch) return;

    if (match.nextMatchSlot === 'home') {
      nextMatch.homeTeamId = winnerId;
    } else {
      nextMatch.awayTeamId = winnerId;
    }

    await this.matchRepo.save(nextMatch);
  }

  /** Determina quais times avançam da fase de grupos/liga */
  private async _getAdvancingTeams(tournament: Tournament): Promise<Team[]> {
    const groups = await this.groupRepo.find({
      where: { tournamentId: tournament.id },
      relations: ['standings', 'standings.team'],
    });

    const advancing: Team[] = [];

    if (tournament.format === TournamentFormat.LEAGUE) {
      // Liga: pega os top N do único grupo
      const allStandings = groups.flatMap((g) => g.standings);
      const sorted = this._sortStandings(allStandings);
      advancing.push(...sorted.slice(0, tournament.teamsAdvancing).map((s) => s.team));
    } else {
      // Grupos: pega top N de cada grupo
      for (const group of groups) {
        const sorted = this._sortStandings(group.standings);
        advancing.push(...sorted.slice(0, tournament.teamsAdvancing).map((s) => s.team));
      }
    }

    return advancing;
  }

  /** Ordena classificação: pontos > saldo > gols pró */
  /**
   * Ordena standings com os seguintes critérios de desempate (em ordem):
   * 1. Pontos
   * 2. Defesa menos vazada (goalsAgainst ↓)
   * 3. Saldo de gols (goalsFor - goalsAgainst ↑)
   * 4. Menos cartões (amarelo + vermelho×2 ↓)
   * 5. Confronto direto — pontos H2H, depois saldo H2H
   * 6. Mais gols marcados (goalsFor ↑)
   * 7. Mais vitórias (wins ↑)
   * 8. Ordem alfabética (determinístico)
   */
  private _sortStandings(
    standings: GroupStanding[],
    cardMap?: Map<number, { yellow: number; red: number }>,
    matches?: Match[],
  ): GroupStanding[] {
    const h2hMap = matches ? this._buildH2HMap(matches) : null;

    return [...standings].sort((a, b) => {
      // 1. Pontos
      if (b.points !== a.points) return b.points - a.points;

      // 2. Defesa menos vazada
      if (a.goalsAgainst !== b.goalsAgainst) return a.goalsAgainst - b.goalsAgainst;

      // 3. Saldo de gols
      const diffA = a.goalsFor - a.goalsAgainst;
      const diffB = b.goalsFor - b.goalsAgainst;
      if (diffB !== diffA) return diffB - diffA;

      // 4. Menos cartões (amarelo + vermelho×2)
      if (cardMap) {
        const cA = cardMap.get(a.teamId) ?? { yellow: 0, red: 0 };
        const cB = cardMap.get(b.teamId) ?? { yellow: 0, red: 0 };
        const wA = cA.yellow + cA.red * 2;
        const wB = cB.yellow + cB.red * 2;
        if (wA !== wB) return wA - wB;
      }

      // 5. Confronto direto (pontos H2H → saldo H2H)
      if (h2hMap) {
        const h2hA = h2hMap.get(`${a.teamId}:${b.teamId}`) ?? { points: 0, goalsFor: 0, goalsAgainst: 0 };
        const h2hB = h2hMap.get(`${b.teamId}:${a.teamId}`) ?? { points: 0, goalsFor: 0, goalsAgainst: 0 };
        if (h2hA.points !== h2hB.points) return h2hB.points - h2hA.points;
        const h2hDiffA = h2hA.goalsFor - h2hA.goalsAgainst;
        const h2hDiffB = h2hB.goalsFor - h2hB.goalsAgainst;
        if (h2hDiffA !== h2hDiffB) return h2hDiffB - h2hDiffA;
      }

      // 6. Mais gols marcados
      if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;

      // 7. Mais vitórias
      if (b.wins !== a.wins) return b.wins - a.wins;

      // 8. Ordem alfabética
      return (a.team?.name ?? '').localeCompare(b.team?.name ?? '');
    });
  }

  /**
   * Constrói mapa de confronto direto a partir das partidas finalizadas.
   * Chave: `${teamAId}:${teamBId}` → { points, goalsFor, goalsAgainst } de teamA contra teamB.
   */
  private _buildH2HMap(matches: Match[]): Map<string, { points: number; goalsFor: number; goalsAgainst: number }> {
    const map = new Map<string, { points: number; goalsFor: number; goalsAgainst: number }>();
    const init = () => ({ points: 0, goalsFor: 0, goalsAgainst: 0 });

    for (const m of matches) {
      if (m.homeScore === null || m.awayScore === null || !m.homeTeamId || !m.awayTeamId) continue;

      const keyH = `${m.homeTeamId}:${m.awayTeamId}`;
      const keyA = `${m.awayTeamId}:${m.homeTeamId}`;
      const home = map.get(keyH) ?? init();
      const away = map.get(keyA) ?? init();

      home.goalsFor      += m.homeScore;
      home.goalsAgainst  += m.awayScore;
      away.goalsFor      += m.awayScore;
      away.goalsAgainst  += m.homeScore;

      if (m.homeScore > m.awayScore)       { home.points += 3; }
      else if (m.homeScore === m.awayScore) { home.points += 1; away.points += 1; }
      else                                  { away.points += 3; }

      map.set(keyH, home);
      map.set(keyA, away);
    }
    return map;
  }

  /** Seeding: distribui times em pares para o bracket */
  private _seedTeams(teams: Team[], bracketSize: number): (Team | null)[] {
    const slots: (Team | null)[] = Array(bracketSize).fill(null);
    // Posições alternadas para garantir que 1º enfrente o último
    const positions = this._bracketPositions(bracketSize);
    teams.forEach((team, i) => {
      slots[positions[i]] = team;
    });
    return slots;
  }

  private _bracketPositions(size: number): number[] {
    if (size === 1) return [0];
    const half = size / 2;
    const left  = this._bracketPositions(half).map((p) => p * 2);
    const right = this._bracketPositions(half).map((p) => p * 2 + 1).reverse();
    return [...left, ...right];
  }

  private _nextPowerOf2(n: number): number {
    let p = 1;
    while (p < n) p *= 2;
    return p;
  }

  private _firstKnockoutPhase(teamCount: number): MatchPhase {
    if (teamCount <= 2)  return MatchPhase.FINAL;
    if (teamCount <= 4)  return MatchPhase.SEMI_FINAL;
    if (teamCount <= 8)  return MatchPhase.QUARTER_FINAL;
    return MatchPhase.ROUND_OF_16;
  }

  private _knockoutPhaseSequence(first: MatchPhase): MatchPhase[] {
    const order = [
      MatchPhase.ROUND_OF_16,
      MatchPhase.QUARTER_FINAL,
      MatchPhase.SEMI_FINAL,
      MatchPhase.FINAL,
    ];
    return order.slice(order.indexOf(first));
  }

  private async _assignToNextMatch(nextPhaseMatches: Match[], currentIdx: number, teamId: number) {
    const target = nextPhaseMatches[Math.floor(currentIdx / 2)];
    if (!target) return;
    if (currentIdx % 2 === 0) target.homeTeamId = teamId;
    else target.awayTeamId = teamId;
    await this.matchRepo.save(target);
  }

  private _getWinnerId(match: Match): number | null {
    if (match.homeScore === null || match.awayScore === null) return null;
    if (match.homeScore > match.awayScore) return match.homeTeamId;
    if (match.awayScore > match.homeScore) return match.awayTeamId;
    // Empate: desempate por pênaltis
    if (match.homePenalties !== null && match.awayPenalties !== null) {
      return match.homePenalties > match.awayPenalties ? match.homeTeamId : match.awayTeamId;
    }
    return null;
  }

  private _getWinner(match: Match): { id: number; name: string; logoUrl: string | null } | null {
    const winnerId = this._getWinnerId(match);
    if (!winnerId) return null;
    const team = winnerId === match.homeTeamId ? match.homeTeam : match.awayTeam;
    return team ? { id: team.id, name: team.name, logoUrl: team.logoUrl ?? null } : null;
  }
 
// ─── ADICIONE estes métodos na seção de VENUES (novo bloco) ─────────────────
 
  // ─── VENUES ───────────────────────────────────────────────────────────────
 
  async createVenue(tournamentId: number, dto: CreateVenueDto): Promise<Venue> {
    await this._findTournament(tournamentId);
    const venue = this.venueRepo.create({
      ...dto,
      address:  dto.address  ?? null,
      city:     dto.city     ?? null,
      mapUrl:   dto.mapUrl   ?? null,
      capacity: dto.capacity ?? null,
      tournamentId,
    });
    return this.venueRepo.save(venue);
  }
 
  async listVenues(tournamentId: number): Promise<Venue[]> {
    await this._findTournament(tournamentId);
    return this.venueRepo.find({
      where: { tournamentId },
      order: { name: 'ASC' },
    });
  }
 
  async updateVenue(venueId: number, dto: UpdateVenueDto): Promise<Venue> {
    const venue = await this.venueRepo.findOne({ where: { id: venueId } });
    if (!venue) throw new NotFoundException('Local não encontrado.');
    Object.assign(venue, dto);
    return this.venueRepo.save(venue);
  }
 
  async deleteVenue(venueId: number): Promise<void> {
    const venue = await this.venueRepo.findOne({ where: { id: venueId } });
    if (!venue) throw new NotFoundException('Local não encontrado.');
 
    // Desvincula partidas que usavam este local antes de remover
    await this.matchRepo.update({ venueId }, { venueId: null });
    await this.venueRepo.remove(venue);
  }
}