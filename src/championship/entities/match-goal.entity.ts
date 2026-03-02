import {
  Entity, PrimaryGeneratedColumn, Column,
  ManyToOne, JoinColumn,
} from 'typeorm';
import { Match } from './match.entity';
import { Player } from './player.entity';
import { Team } from './team.entity';

@Entity('championship_match_goals')
export class MatchGoal {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  matchId: number;

  @Column()
  playerId: number;

  @Column()
  teamId: number;

  @ManyToOne(() => Match,  { onDelete: 'CASCADE', eager: false })
  @JoinColumn({ name: 'matchId' })
  match: Match;

  @ManyToOne(() => Player, { onDelete: 'CASCADE', eager: false })
  @JoinColumn({ name: 'playerId' })
  player: Player;

  @ManyToOne(() => Team,   { onDelete: 'CASCADE', eager: false })
  @JoinColumn({ name: 'teamId' })
  team: Team;
}
