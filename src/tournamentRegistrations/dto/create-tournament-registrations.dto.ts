import { IsInt, IsString, IsOptional, IsEmail } from 'class-validator';

export class CreateTournamentRegistrationDto {
  @IsInt()
  tournamentId: number;

  @IsString()
  @IsOptional()
  category?: string;

  @IsEmail()
  @IsOptional()
  partnerEmail?: string;

  gender: 'male' | 'female';
}
