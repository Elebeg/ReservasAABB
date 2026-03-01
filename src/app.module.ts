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
import { AdminModule } from './admin/admin.module';
import { ChampionshipModule } from './championship/championship.module';
import { Tournament } from './championship/entities/tournament.entity';
import { Team } from './championship/entities/team.entity';
import { TournamentGroup } from './championship/entities/tournament-group.entity';
import { GroupStanding } from './championship/entities/group-standing.entity';
import { Match } from './championship/entities/match.entity';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRoot({
      type: 'postgres',
      // --- LOCAL ---
      //host: process.env.DATABASE_HOST || 'localhost',
      //port: Number(process.env.DATABASE_PORT || 5433),
      //username: process.env.DATABASE_USER || 'postgres',
      //password: process.env.DATABASE_PASSWORD || 'postgres',
      //database: process.env.DATABASE_NAME || 'beachtennis',
      // --- PRODUÇÃO (substituir bloco acima pelo abaixo) ---
      url: process.env.DATABASE_URL,
      entities: [User, Court, Reservation, Tournament, Team, TournamentGroup, GroupStanding, Match],
      synchronize: true,
    }),
    UsersModule,
    AuthModule,
    CourtsModule,
    ReservationsModule,
    AdminModule,
    ChampionshipModule,
  ],
})
export class AppModule {}
