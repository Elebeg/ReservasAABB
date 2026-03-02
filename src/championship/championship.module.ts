import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ChampionshipController } from './championship.controller';
import { ChampionshipPublicController } from './championship-public.controller';
import { ChampionshipService } from './championship.service';
import { Tournament } from './entities/tournament.entity';
import { Team } from './entities/team.entity';
import { TournamentGroup } from './entities/tournament-group.entity';
import { GroupStanding } from './entities/group-standing.entity';
import { Match } from './entities/match.entity';
import { Player } from './entities/player.entity';
import { MatchGoal } from './entities/match-goal.entity';
import { AdminAuthGuard } from '../admin/admin-auth.guard';

@Module({
  imports: [
    TypeOrmModule.forFeature([Tournament, Team, TournamentGroup, GroupStanding, Match, Player, MatchGoal]),
    ConfigModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET'),
        signOptions: { expiresIn: config.get<string>('JWT_EXPIRES_IN') || '1h' },
      }),
    }),
  ],
  controllers: [ChampionshipController, ChampionshipPublicController],
  providers: [ChampionshipService, AdminAuthGuard],
})
export class ChampionshipModule {}
