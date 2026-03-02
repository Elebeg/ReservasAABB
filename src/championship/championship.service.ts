import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Tournament, TournamentFormat, TournamentStatus } from './entities/tournament.entity';
import { Team } from './entities/team.entity';
import { TournamentGroup } from './entities/tournament-group.entity';
import { GroupStanding } from './entities/group-standing.entity';
import { Match, MatchPhase, MatchStatus } from './entities/match.entity';
import { Player, PlayerPosition } from './entities/player.entity';
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

  // ─── TEAMS ────────────────────────────────────────────────────────────────

  async addTeam(tournamentId: number, dto: AddTeamDto): Promise<Team> {
    const tournament = await this._findTournament(tournamentId);
    if (tournament.status !== TournamentStatus.DRAFT) {
      throw new BadRequestException('Não é possível adicionar times após o início do torneio.');
    }
    const team = this.teamRepo.create({ name: dto.name, logoUrl: dto.logoUrl ?? null, tournamentId });
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

    match.homeScore     = null;
    match.awayScore     = null;
    match.homePenalties = null;
    match.awayPenalties = null;
    match.status        = MatchStatus.SCHEDULED;
    await this.matchRepo.save(match);

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

    const phaseLabels: Record<MatchPhase, string> = {
      [MatchPhase.GROUP]:         'Fase de Grupos',
      [MatchPhase.ROUND_OF_16]:   'Oitavas de Final',
      [MatchPhase.QUARTER_FINAL]: 'Quartas de Final',
      [MatchPhase.SEMI_FINAL]:    'Semifinal',
      [MatchPhase.FINAL]:         'Final',
    };

    const rounds: {
      phase: MatchPhase;
      label: string;
      matches: {
        id: number;
        status: MatchStatus;
        homeTeam: { id: number; name: string } | null;
        awayTeam: { id: number; name: string } | null;
        homeScore: number | null;
        awayScore: number | null;
        homePenalties: number | null;
        awayPenalties: number | null;
        winner: { id: number; name: string } | null;
      }[];
    }[] = [];

    for (const phase of knockoutPhases) {
      const matches = await this.matchRepo.find({
        where: { tournamentId, phase },
        order: { id: 'ASC' },
      });
      if (!matches.length) continue;

      rounds.push({
        phase,
        label: phaseLabels[phase],
        matches: matches.map((m) => ({
          id:           m.id,
          status:       m.status,
          homeTeam:     m.homeTeam ? { id: m.homeTeam.id, name: m.homeTeam.name, logoUrl: m.homeTeam.logoUrl ?? null } : null,
          awayTeam:     m.awayTeam ? { id: m.awayTeam.id, name: m.awayTeam.name, logoUrl: m.awayTeam.logoUrl ?? null } : null,
          homeScore:    m.homeScore,
          awayScore:    m.awayScore,
          homePenalties: m.homePenalties,
          awayPenalties: m.awayPenalties,
          winner:       this._getWinner(m),
        })),
      });
    }

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

    return groups.map((g) => ({
      group:     g.name,
      standings: this._sortStandings(g.standings, cardMap).map((s, i) => ({
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
    const matches = await this.matchRepo.find({ where, order: { scheduledAt: 'ASC', round: 'ASC', id: 'ASC' } });
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
    }));
  }


  /** Define (ou limpa) a data/hora de uma partida */
  async scheduleMatch(matchId: number, dto: ScheduleMatchDto): Promise<{ id: number; scheduledAt: Date | null }> {
    const match = await this.matchRepo.findOne({ where: { id: matchId } });
    if (!match) throw new NotFoundException('Partida não encontrada.');
    match.scheduledAt = dto.scheduledAt ? new Date(dto.scheduledAt) : null;
    await this.matchRepo.save(match);
    return { id: match.id, scheduledAt: match.scheduledAt };
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
    if (dto.name     !== undefined) player.name     = dto.name;
    if (dto.number   !== undefined) player.number   = dto.number;
    if (dto.position !== undefined) player.position = dto.position;
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

  // ─── PRIVATE HELPERS ──────────────────────────────────────────────────────

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
  private _sortStandings(standings: GroupStanding[], cardMap?: Map<number, { yellow: number; red: number }>): GroupStanding[] {
    return [...standings].sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      if (b.wins   !== a.wins)   return b.wins - a.wins;
      const diffA = a.goalsFor - a.goalsAgainst;
      const diffB = b.goalsFor - b.goalsAgainst;
      if (diffB !== diffA) return diffB - diffA;
      if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
      if (cardMap) {
        const cA = cardMap.get(a.teamId) ?? { yellow: 0, red: 0 };
        const cB = cardMap.get(b.teamId) ?? { yellow: 0, red: 0 };
        if (cA.red !== cB.red) return cA.red - cB.red;
        if (cA.yellow !== cB.yellow) return cA.yellow - cB.yellow;
      }
      return 0;
    });
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
}
