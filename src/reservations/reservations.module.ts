import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Reservation } from './reservation.entity';
import { ReservationsService } from './reservations.service';
import { ReservationsController } from './reservations.controller';
import { CourtsModule } from '../courts/courts.module';
import { UsersModule } from '../users/users.module';
import { Court } from 'src/courts/court.entity';
import { User } from 'src/users/user.entity';
import { TournamentsModule } from 'src/tournaments/tournament.module';

@Module({
  imports: [TypeOrmModule.forFeature([Reservation, Court, User]), 
  CourtsModule, 
  UsersModule,
  TournamentsModule,
  ],
  providers: [ReservationsService],
  controllers: [ReservationsController],
})
export class ReservationsModule {}
