import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Tournament } from './tournament.entity';
import { TournamentRegistration } from '../tournamentRegistrations/tournament-registration.entity';
import { TournamentsService } from './tournaments.service';
import { TournamentsController } from './tournaments.controller';
import { TournamentRegistrationsService } from '../tournamentRegistrations/tournament-registrations.service';
import { TournamentRegistrationsController } from '../tournamentRegistrations/tournament-registrations.controller';
import { CourtsModule } from '../courts/courts.module';
import { Court } from '../courts/court.entity';
import { UsersModule } from '../users/users.module';
import { User } from '../users/user.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Tournament, TournamentRegistration, Court, User]),
    CourtsModule,
    UsersModule
  ],
  providers: [TournamentsService, TournamentRegistrationsService],
  controllers: [TournamentsController, TournamentRegistrationsController],
  exports: [TournamentsService, TournamentRegistrationsService],
})
export class TournamentsModule {}