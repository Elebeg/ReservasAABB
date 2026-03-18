import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
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
import { Player } from './championship/entities/player.entity';
import { MatchGoal } from './championship/entities/match-goal.entity';
import { MatchCard } from './championship/entities/match-card.entity';
import { Venue } from './championship/entities/venue.entity';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    ConfigModule.forRoot({ isGlobal: true }),

    // ── Rate limiting: 60 req/minuto por IP (geral) ──────────────────────────
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: 60000,   // janela de 1 minuto
        limit: 60,    // máx 60 requisições por janela
      },
      {
        name: 'auth',
        ttl: 60000,   // janela de 1 minuto
        limit: 10,    // máx 10 tentativas de login por minuto
      },
    ]),

    TypeOrmModule.forRoot({
      type: 'postgres',
      url: process.env.DATABASE_URL,
      entities: [
        User, 
        Court, 
        Reservation, 
        Tournament, 
        Team, 
        TournamentGroup, 
        GroupStanding, 
        Match, 
        Player, 
        MatchGoal, 
        MatchCard, 
        Venue,
      ],
      synchronize: true, 
    }),
    UsersModule,
    AuthModule,
    CourtsModule,
    ReservationsModule,
    AdminModule,
    ChampionshipModule,
  ],
  providers: [
    // Aplica rate limiting globalmente
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
