import { Entity, PrimaryGeneratedColumn, Column, OneToMany, CreateDateColumn } from 'typeorm';
import { Team } from './team.entity';
import { TournamentGroup } from './tournament-group.entity';
import { Match } from './match.entity';

export enum TournamentFormat {
  GROUPS   = 'GROUPS',    // Fase de grupos → mata-mata
  LEAGUE   = 'LEAGUE',    // Todos contra todos → top N avançam
  KNOCKOUT = 'KNOCKOUT',  // Mata-mata direto desde o início
}

export enum TournamentStatus {
  DRAFT          = 'DRAFT',
  GROUP_STAGE    = 'GROUP_STAGE',
  KNOCKOUT_STAGE = 'KNOCKOUT_STAGE',
  FINISHED       = 'FINISHED',
}

@Entity('tournaments')
export class Tournament {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column({ nullable: true })
  description: string;

  @Column({ type: 'enum', enum: TournamentFormat })
  format: TournamentFormat;

  @Column({ type: 'enum', enum: TournamentStatus, default: TournamentStatus.DRAFT })
  status: TournamentStatus;

  // Número de grupos (apenas para formato GROUPS)
  @Column({ default: 1 })
  groupCount: number;

  // Quantos times avançam por grupo (GROUPS) ou no total (LEAGUE)
  @Column({ default: 2 })
  teamsAdvancing: number;

  @Column({ default: false })
  active: boolean;

  @Column({ nullable: true, type: 'date' })
  startDate: Date;

  @CreateDateColumn()
  createdAt: Date;

  @OneToMany(() => Team, (team) => team.tournament, { cascade: true })
  teams: Team[];

  @OneToMany(() => TournamentGroup, (group) => group.tournament, { cascade: true })
  groups: TournamentGroup[];

  @OneToMany(() => Match, (match) => match.tournament, { cascade: true })
  matches: Match[];
}
