import { IsString, IsDateString, IsArray, IsOptional, IsBoolean, IsNumber } from 'class-validator';

export class UpdateTournamentDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsDateString()
  @IsOptional()
  date?: string;

  @IsArray()
  @IsOptional()
  courtIds?: number[];

  @IsString()
  @IsOptional()
  type?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
  
  @IsBoolean()
  @IsOptional()
  isRegistrationOpen?: boolean;
  
  @IsNumber()
  @IsOptional()
  maxParticipants?: number;
  
  @IsArray()
  @IsOptional()
  categories?: string[];
}