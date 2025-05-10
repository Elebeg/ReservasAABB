import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { User } from './users/user.entity';
import { Court } from './courts/court.entity';
import { Reservation } from './reservations/reservation.entity';
import { CourtsModule } from './courts/courts.module';
import { ReservationsModule } from './reservations/reservations.module';
import { ScheduleModule } from '@nestjs/schedule';
import { TournamentsModule } from './tournaments/tournament.module';
import { Tournament } from './tournaments/tournament.entity';
import { TournamentRegistration } from './tournamentRegistrations/tournament-registration.entity';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRoot({
      type: 'postgres',
      //url: process.env.DATABASE_URL,
      host: process.env.DATABASE_HOST,
      port: Number(process.env.DATABASE_PORT || 5432),
      username: process.env.DATABASE_USER,
      password: process.env.DATABASE_PASSWORD,
      database: process.env.DATABASE_NAME,
      entities: [User, Court, Reservation, Tournament, TournamentRegistration],
      synchronize: true, 
    }),
    UsersModule,
    AuthModule,
    CourtsModule,
    ReservationsModule,
    TournamentsModule,
    ReservationsModule,
  ],
})
export class AppModule {}
