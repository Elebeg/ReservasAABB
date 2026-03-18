import {
  IsString, IsOptional, IsNumber, IsInt, IsBoolean,
  IsEnum, IsArray, ValidateNested, IsIn, Min, IsDateString,
  ValidateIf, Allow, IsUrl,
} from 'class-validator';
import { Type } from 'class-transformer';
import { TournamentFormat } from '../entities/tournament.entity';
import { PlayerPosition } from '../entities/player.entity';

export class CreateTournamentDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsEnum(TournamentFormat)
  format: TournamentFormat;

  @IsOptional()
  @IsInt()
  groupCount?: number;

  @IsInt()
  @Min(1)
  teamsAdvancing: number;

  @IsOptional()
  @IsString()
  startDate?: string;
}

export class AddTeamDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  logoUrl?: string;
}

export class UpdateTeamLogoDto {
  @IsOptional()
  @IsString()
  logoUrl: string | null;
}

export class RecordResultDto {
  @IsInt()
  @Min(0)
  homeScore: number;

  @IsInt()
  @Min(0)
  awayScore: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  homePenalties?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  awayPenalties?: number;
}

export class UpdateResultDto {
  @IsInt()
  @Min(0)
  homeScore: number;

  @IsInt()
  @Min(0)
  awayScore: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  homePenalties?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  awayPenalties?: number;
}

export class AssignGroupsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => GroupAssignmentItemDto)
  assignments: GroupAssignmentItemDto[];
}

class GroupAssignmentItemDto {
  @IsInt()
  teamId: number;

  @IsInt()
  groupIndex: number;
}

export class ScheduleMatchDto {
  @IsOptional()
  @IsString()
  scheduledAt?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  venueId?: number | null;
}

// ─── VENUES ─────────────────────────────────────────────────────────────────

export class CreateVenueDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  address?: string | null;

  @IsOptional()
  @IsString()
  city?: string | null;

  @IsOptional()
  @IsString()
  mapUrl?: string | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  capacity?: number | null;
}

export class UpdateVenueDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  address?: string | null;

  @IsOptional()
  @IsString()
  city?: string | null;

  @IsOptional()
  @IsString()
  mapUrl?: string | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  capacity?: number | null;
}

// ─── PLAYERS ────────────────────────────────────────────────────────────────

export class AddPlayerDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsInt()
  number?: number;

  @IsOptional()
  @IsEnum(PlayerPosition)
  position?: PlayerPosition;
}

export class ImportPlayerItemDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsInt()
  number?: number;

  @IsOptional()
  @IsEnum(PlayerPosition)
  position?: PlayerPosition;
}

export class ImportPlayersDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ImportPlayerItemDto)
  players: ImportPlayerItemDto[];
}

export class BulkImportPlayersDto {
  @IsArray()
  @IsString({ each: true })
  lines: string[];
}

export class AddGoalDto {
  @IsOptional()
  @IsInt()
  playerId?: number | null;

  @IsInt()
  teamId: number;

  @IsOptional()
  @IsBoolean()
  ownGoal?: boolean;
}

export class PatchGoalDto {
  @IsOptional()
  @IsInt()
  playerId: number | null;
}

export class UploadSumulaDto {
  @ValidateIf(o => o.sumulaUrl !== null)
  @IsOptional()
  @IsString()
  sumulaUrl: string | null;
}

export class AddMatchCardDto {
  @IsInt()
  playerId: number;

  @IsInt()
  teamId: number;

  @IsIn(['YELLOW', 'RED'])
  type: 'YELLOW' | 'RED';
}

export class UpdatePlayerDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @ValidateIf(o => o.number !== null)
  @IsInt()
  number?: number | null;

  @IsOptional()
  @ValidateIf(o => o.position !== null)
  @IsEnum(PlayerPosition)
  position?: PlayerPosition | null;

  @IsOptional()
  @ValidateIf(o => o.birthDate !== null)
  @IsString()
  birthDate?: string | null;
}

export class UpdatePlayerStatsDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  goals?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  yellowCards?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  redCards?: number;
}