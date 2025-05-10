import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TournamentRegistration } from './tournament-registration.entity';
import { TournamentRegistrationsService } from './tournament-registrations.service';
import { TournamentRegistrationsController } from './tournament-registrations.controller';
import { Tournament } from '../tournaments/tournament.entity';
import { User } from '../users/user.entity';
import { UsersService } from '../users/users.service';
import { TournamentsService } from '../tournaments/tournaments.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([TournamentRegistration, Tournament, User]),
  ],
  providers: [TournamentRegistrationsService, TournamentsService, UsersService],
  controllers: [TournamentRegistrationsController],
})
export class TournamentRegistrationsModule {}
