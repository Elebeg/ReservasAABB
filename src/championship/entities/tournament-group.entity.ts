import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { Tournament } from './tournament.entity';
import { GroupStanding } from './group-standing.entity';

@Entity('tournament_groups')
export class TournamentGroup {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string; // "Grupo A", "Grupo B" ...

  @ManyToOne(() => Tournament, (t) => t.groups, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tournamentId' })
  tournament: Tournament;

  @Column()
  tournamentId: number;

  @OneToMany(() => GroupStanding, (s) => s.group, { cascade: true })
  standings: GroupStanding[];
}
