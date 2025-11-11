import { IsDateString, IsOptional } from 'class-validator';

export class UpdateReservationDto {
  @IsOptional()
  @IsDateString()
  startTime?: string;
}
