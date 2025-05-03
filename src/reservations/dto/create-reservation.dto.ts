import { IsInt, IsDateString, IsNotEmpty } from 'class-validator';

export class CreateReservationDto {
  @IsInt()
  @IsNotEmpty()
  courtId: number;

  @IsDateString()
  @IsNotEmpty()
  startTime: string;
}
