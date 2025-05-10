import { IsString, IsDateString, IsArray, IsOptional, IsNumber, IsBoolean } from 'class-validator';

export class CreateTournamentDto {
  @IsString()
  name: string;

  @IsDateString()
  date: string;

  @IsArray()
  courtIds: number[];

  @IsString()
  @IsOptional()
  type?: string = 'beach_tennis';
  
  @IsBoolean()
  @IsOptional()
  isRegistrationOpen?: boolean = true;
  
  @IsNumber()
  @IsOptional()
  maxParticipants?: number;

  @IsNumber()
  @IsOptional()
  maxParticipantsByGender?: { male: number; female: number };
  
  @IsArray()
  @IsOptional()
  categories?: string[];
}