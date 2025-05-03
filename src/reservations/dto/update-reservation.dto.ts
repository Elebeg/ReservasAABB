// src/reservations/dto/update-reservation.dto.ts
import { IsDateString, IsISO8601 } from 'class-validator';

export class UpdateReservationDto {
  @IsDateString()
  @IsISO8601({ strict: true })
  startTime: string;
}
