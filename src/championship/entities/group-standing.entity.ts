import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { TournamentGroup } from './tournament-group.entity';
import { Team } from './team.entity';

@Entity('group_standings')
export class GroupStanding {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => TournamentGroup, (g) => g.standings, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'groupId' })
  group: TournamentGroup;

  @Column()
  groupId: number;

  @ManyToOne(() => Team, { onDelete: 'CASCADE', eager: true })
  @JoinColumn({ name: 'teamId' })
  team: Team;

  @Column()
  teamId: number;

  @Column({ default: 0 }) points: number;
  @Column({ default: 0 }) played: number;
  @Column({ default: 0 }) wins: number;
  @Column({ default: 0 }) draws: number;
  @Column({ default: 0 }) losses: number;
  @Column({ default: 0 }) goalsFor: number;
  @Column({ default: 0 }) goalsAgainst: number;

  get goalDiff(): number {
    return this.goalsFor - this.goalsAgainst;
  }
}
