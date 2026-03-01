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

  // ─── STANDINGS & BRACKET ──────────────────────────────────────────────────

  @Get('tournaments/:id/standings')
  getStandings(@Param('id') id: string) {
    return this.service.getStandings(Number(id));
  }

  @Get('tournaments/:id/bracket')
  getBracket(@Param('id') id: string) {
    return this.service.getBracket(Number(id));
  }
}
