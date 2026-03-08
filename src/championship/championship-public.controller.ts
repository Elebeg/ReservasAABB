import { Controller, Get, Param, Query } from '@nestjs/common';
import { ChampionshipService } from './championship.service';
import { MatchPhase } from './entities/match.entity';

/**
 * Rotas públicas do campeonato — sem autenticação.
 * Usadas pela landing page para exibir tabelas, bracket e partidas.
 */
@Controller('championship')
export class ChampionshipPublicController {
  constructor(private readonly service: ChampionshipService) {}

  /** Torneio atualmente ativo */
  @Get('active')
  getActiveTournament() {
    return this.service.getActiveTournament();
  }

  /** Tabela de classificação do torneio ativo */
  @Get('active/standings')
  async getActiveStandings() {
    const tournament = await this.service.getActiveTournament();
    return this.service.getStandings(tournament.id);
  }

  /** Bracket mata-mata do torneio ativo */
  @Get('active/bracket')
  async getActiveBracket() {
    const tournament = await this.service.getActiveTournament();
    return this.service.getBracket(tournament.id);
  }

  /** Partidas do torneio ativo (filtro opcional por fase) */
  @Get('active/matches')
  async getActiveMatches(@Query('phase') phase?: MatchPhase) {
    const tournament = await this.service.getActiveTournament();
    return this.service.getMatches(tournament.id, phase);
  }

  /** Detalhe de qualquer torneio por ID (para histórico) */
  @Get('tournaments/:id')
  getTournament(@Param('id') id: string) {
    return this.service.getTournament(Number(id));
  }

  /** Tabela de classificação de qualquer torneio */
  @Get('tournaments/:id/standings')
  getStandings(@Param('id') id: string) {
    return this.service.getStandings(Number(id));
  }

  /** Bracket de qualquer torneio */
  @Get('tournaments/:id/bracket')
  getBracket(@Param('id') id: string) {
    return this.service.getBracket(Number(id));
  }

  /** Partidas de qualquer torneio */
  @Get('tournaments/:id/matches')
  getMatches(@Param('id') id: string, @Query('phase') phase?: MatchPhase) {
    return this.service.getMatches(Number(id), phase);
  }

  /** Artilharia + ranking de cartões do torneio ativo */
  @Get('active/players')
  async getActivePlayers() {
    const tournament = await this.service.getActiveTournament();
    return this.service.listAllPlayers(tournament.id);
  }

  /** Jogadores de um time específico */
  @Get('active/teams/:teamId/players')
  async getActiveTeamPlayers(@Param('teamId') teamId: string) {
    const tournament = await this.service.getActiveTournament();
    return this.service.listPlayers(tournament.id, Number(teamId));
  }

  /** Detalhe de uma partida: gols, cartões e súmula */
  @Get('matches/:matchId/detail')
  getMatchDetail(@Param('matchId') matchId: string) {
    return this.service.getMatchDetail(Number(matchId));
  }
}
