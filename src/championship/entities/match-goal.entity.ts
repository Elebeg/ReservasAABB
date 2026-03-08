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

  @Column({ nullable: true })
  playerId: number | null;

  @Column()
  teamId: number;

  @Column({ default: false })
  ownGoal: boolean;

  @ManyToOne(() => Match,  { onDelete: 'CASCADE', eager: false })
  @JoinColumn({ name: 'matchId' })
  match: Match;

  @ManyToOne(() => Player, { onDelete: 'SET NULL', nullable: true, eager: false })
  @JoinColumn({ name: 'playerId' })
  player: Player | null;

  @ManyToOne(() => Team,   { onDelete: 'CASCADE', eager: false })
  @JoinColumn({ name: 'teamId' })
  team: Team;
}
