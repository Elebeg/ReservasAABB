import { TournamentFormat } from '../entities/tournament.entity';

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
