import { IsInt, IsString, IsOptional, IsEmail } from 'class-validator';

export class UpdateTournamentRegistrationDto {
    @IsString()
    @IsOptional()
    status?: string;
  
    @IsString()
    @IsOptional()
    category?: string;
  
    @IsEmail()
    @IsOptional()
    partnerEmail?: string;
  }