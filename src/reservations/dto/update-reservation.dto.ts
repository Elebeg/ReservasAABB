// src/reservations/dto/update-reservation.dto.ts
import { IsDateString } from 'class-validator';

export class UpdateReservationDto {
  @IsDateString()
  startTime: string;
}
