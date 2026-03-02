import {
  Controller, Get, Post, Patch, Delete, Param,
  Body, UseGuards, Query, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ChampionshipService } from './championship.service';
import { AdminAuthGuard } from '../admin/admin-auth.guard';
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
import { MatchPhase } from './entities/match.entity';

@Controller('admin/championship')
@UseGuards(AdminAuthGuard)
export class ChampionshipController {
  constructor(private readonly service: ChampionshipService) {}

  // ─── TOURNAMENTS ──────────────────────────────────────────────────────────

  @Post('tournaments')
  createTournament(@Body() dto: CreateTournamentDto) {
    return this.service.createTournament(dto);
  }

  @Get('tournaments')
  listTournaments() {
    return this.service.listTournaments();
  }

  @Get('tournaments/:id')
  getTournament(@Param('id') id: string) {
    return this.service.getTournament(Number(id));
  }

  @Delete('tournaments/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteTournament(@Param('id') id: string) {
    return this.service.deleteTournament(Number(id));
  }

  /** Define o torneio como ativo (exibido publicamente) */
  @Patch('tournaments/:id/set-active')
  setActiveTournament(@Param('id') id: string) {
    return this.service.setActiveTournament(Number(id));
  }

  // ─── TEAMS ────────────────────────────────────────────────────────────────

  @Post('tournaments/:id/teams')
  addTeam(@Param('id') id: string, @Body() dto: AddTeamDto) {
    return this.service.addTeam(Number(id), dto);
  }

  @Get('tournaments/:id/teams')
  listTeams(@Param('id') id: string) {
    return this.service.listTeams(Number(id));
  }

  @Delete('tournaments/:id/teams/:teamId')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeTeam(@Param('id') id: string, @Param('teamId') teamId: string) {
    return this.service.removeTeam(Number(id), Number(teamId));
  }

  // ─── GROUPS ───────────────────────────────────────────────────────────────

  @Post('tournaments/:id/assign-groups')
  assignGroups(@Param('id') id: string, @Body() dto: AssignGroupsDto) {
    return this.service.assignGroups(Number(id), dto);
  }

  // ─── LIFECYCLE ────────────────────────────────────────────────────────────

  @Post('tournaments/:id/start')
  startTournament(@Param('id') id: string) {
    return this.service.startTournament(Number(id));
  }

  @Post('tournaments/:id/advance-to-knockout')
  advanceToKnockout(@Param('id') id: string) {
    return this.service.advanceToKnockout(Number(id));
  }

  // ─── MATCHES ──────────────────────────────────────────────────────────────

  @Get('tournaments/:id/matches')
  getMatches(
    @Param('id') id: string,
    @Query('phase') phase?: MatchPhase,
  ) {
    return this.service.getMatches(Number(id), phase);
  }

  /** Registra resultado de uma partida */
  @Post('matches/:matchId/result')
  recordResult(@Param('matchId') matchId: string, @Body() dto: RecordResultDto) {
    return this.service.recordResult(Number(matchId), dto);
  }

  /** Corrige resultado já registrado e recalcula tabela/bracket */
  @Patch('matches/:matchId/result')
  updateResult(@Param('matchId') matchId: string, @Body() dto: UpdateResultDto) {
    return this.service.updateResult(Number(matchId), dto);
  }

  /** Define (ou remove) a data/hora agendada de uma partida */
  @Patch('matches/:matchId/schedule')
  scheduleMatch(@Param('matchId') matchId: string, @Body() dto: ScheduleMatchDto) {
    return this.service.scheduleMatch(Number(matchId), dto);
  }

  // ─── STANDINGS & BRACKET ──────────────────────────────────────────────────

  @Get('tournaments/:id/standings')
  getStandings(@Param('id') id: string) {
    return this.service.getStandings(Number(id));
  }

  @Get('tournaments/:id/bracket')
  getBracket(@Param('id') id: string) {
    return this.service.getBracket(Number(id));
  }
  // ─── PLAYERS ──────────────────────────────────────────────────────────────

  @Get('tournaments/:id/teams/:teamId/players')
  listPlayers(@Param('id') id: string, @Param('teamId') teamId: string) {
    return this.service.listPlayers(Number(id), Number(teamId));
  }

  /** Todos os jogadores do torneio — artilharia e ranking de cartões */
  @Get('tournaments/:id/players')
  listAllPlayers(@Param('id') id: string) {
    return this.service.listAllPlayers(Number(id));
  }

  @Post('tournaments/:id/teams/:teamId/players')
  addPlayer(
    @Param('id') id: string,
    @Param('teamId') teamId: string,
    @Body() dto: AddPlayerDto,
  ) {
    return this.service.addPlayer(Number(id), Number(teamId), dto);
  }

  /** Importação estruturada — substitui o elenco atual do time */
  @Post('tournaments/:id/teams/:teamId/players/import')
  importPlayers(
    @Param('id') id: string,
    @Param('teamId') teamId: string,
    @Body() dto: ImportPlayersDto,
  ) {
    return this.service.importPlayers(Number(id), Number(teamId), dto);
  }

  /**
   * Importação por texto — uma linha por jogador: "Nome;Número;Posição"
   * Número e Posição são opcionais. Posições: GK, DEF, MID, FWD
   * Substitui o elenco atual do time.
   */
  @Post('tournaments/:id/teams/:teamId/players/import-lines')
  bulkImportByLines(
    @Param('id') id: string,
    @Param('teamId') teamId: string,
    @Body() dto: BulkImportPlayersDto,
  ) {
    return this.service.bulkImportByLines(Number(id), Number(teamId), dto);
  }

  /** Atualiza nome, número e/ou posição de um jogador (campos opcionais) */
  @Patch('players/:playerId')
  updatePlayer(@Param('playerId') playerId: string, @Body() dto: UpdatePlayerDto) {
    return this.service.updatePlayer(Number(playerId), dto);
  }

  @Delete('players/:playerId')
  @HttpCode(HttpStatus.NO_CONTENT)
  removePlayer(@Param('playerId') playerId: string) {
    return this.service.removePlayer(Number(playerId));
  }

  /** Atualiza estatísticas completas de um jogador */
  @Patch('players/:playerId/stats')
  updatePlayerStats(@Param('playerId') playerId: string, @Body() dto: UpdatePlayerStatsDto) {
    return this.service.updatePlayerStats(Number(playerId), dto);
  }

  /** +1 / -1 rápido em gol ou cartão */
  @Patch('players/:playerId/stat/:stat/increment')
  incrementStat(
    @Param('playerId') playerId: string,
    @Param('stat') stat: 'goals' | 'yellowCards' | 'redCards',
    @Body('delta') delta: 1 | -1,
  ) {
    return this.service.incrementStat(Number(playerId), stat, delta ?? 1);
  }
}
