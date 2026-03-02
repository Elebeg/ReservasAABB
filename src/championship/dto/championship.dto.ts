import { TournamentFormat } from '../entities/tournament.entity';
import { PlayerPosition } from '../entities/player.entity';

export class CreateTournamentDto {
  name: string;
  description?: string;
  format: TournamentFormat;
  groupCount?: number;
  teamsAdvancing: number;
  startDate?: string;
}

export class AddTeamDto {
  name: string;
  logoUrl?: string;
}

export class RecordResultDto {
  homeScore: number;
  awayScore: number;
  homePenalties?: number;
  awayPenalties?: number;
}

export class UpdateResultDto {
  homeScore: number;
  awayScore: number;
  homePenalties?: number;
  awayPenalties?: number;
}

export class AssignGroupsDto {
  assignments: { teamId: number; groupIndex: number }[];
}

export class ScheduleMatchDto {
  /** ISO 8601 com offset — ex: "2025-06-15T15:00:00-03:00" */
  scheduledAt: string | null;
}

// ─── PLAYERS ────────────────────────────────────────────────────────────────

export class AddPlayerDto {
  name: string;
  number?: number;
  position?: PlayerPosition;
}

/** Item individual para importação estruturada */
export class ImportPlayerItemDto {
  name: string;
  number?: number;
  position?: PlayerPosition;
}

/**
 * Importação estruturada — substitui todo o elenco do time.
 * Enviar um array de jogadores com nome, número e posição.
 */
export class ImportPlayersDto {
  players: ImportPlayerItemDto[];
}

/**
 * Importação por texto — uma linha por jogador no formato "Nome;Número;Posição".
 * Número e Posição são opcionais.
 * Posições aceitas: GK, DEF, MID, FWD
 * Ex: ["Pelé;10;FWD", "Taffarel;1;GK", "Só o Nome"]
 */
export class BulkImportPlayersDto {
  lines: string[];
}

/** Adiciona um evento de gol a uma partida */
export class AddGoalDto {
  playerId: number;
  teamId: number;
}

/** Atualiza dados básicos do jogador — todos os campos são opcionais */
export class UpdatePlayerDto {
  name?: string;
  number?: number | null;
  position?: PlayerPosition | null;
}

/** Atualiza estatísticas de um jogador (gols, cartões) */
export class UpdatePlayerStatsDto {
  goals?: number;
  yellowCards?: number;
  redCards?: number;
}
