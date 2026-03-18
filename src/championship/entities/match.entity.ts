import {
  Entity, PrimaryGeneratedColumn, Column,
  ManyToOne, JoinColumn,
} from 'typeorm';
import { Tournament } from './tournament.entity';
import { Team } from './team.entity';
import { Venue } from './venue.entity';

export enum MatchPhase {
  GROUP         = 'GROUP',
  ROUND_OF_16   = 'ROUND_OF_16',
  QUARTER_FINAL = 'QUARTER_FINAL',
  SEMI_FINAL    = 'SEMI_FINAL',
  FINAL         = 'FINAL',
}

export enum MatchStatus {
  SCHEDULED = 'SCHEDULED',
  FINISHED  = 'FINISHED',
}

@Entity('championship_matches')
export class Match {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Tournament, (t) => t.matches, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tournamentId' })
  tournament: Tournament;

  @Column()
  tournamentId: number;

  @Column({ type: 'enum', enum: MatchPhase })
  phase: MatchPhase;

  @Column({ type: 'enum', enum: MatchStatus, default: MatchStatus.SCHEDULED })
  status: MatchStatus;

  // Null enquanto o time ainda não foi definido (mata-mata futuro)
  @ManyToOne(() => Team, { nullable: true, eager: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'homeTeamId' })
  homeTeam: Team | null;

  @Column({ nullable: true })
  homeTeamId: number | null;

  @ManyToOne(() => Team, { nullable: true, eager: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'awayTeamId' })
  awayTeam: Team | null;

  @Column({ nullable: true })
  awayTeamId: number | null;

  @Column({ type: 'int', nullable: true })
  homeScore: number | null;

  @Column({ type: 'int', nullable: true })
  awayScore: number | null;

  // Pênaltis (apenas quando empate no mata-mata)
  @Column({ type: 'int', nullable: true })
  homePenalties: number | null;

  @Column({ type: 'int', nullable: true })
  awayPenalties: number | null;

  // Grupo ao qual a partida pertence (fase de grupos)
  @Column({ type: 'int', nullable: true })
  groupId: number | null;

  // Rodada dentro do grupo ou do mata-mata
  @Column({ default: 1 })
  round: number;

  // Data/hora agendada para a partida
  @Column({ type: 'timestamp', nullable: true })
  scheduledAt: Date | null;

  // Local da partida (opcional)
  @ManyToOne(() => Venue, { nullable: true, eager: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'venueId' })
  venue: Venue | null;

  @Column({ type: 'int', nullable: true })
  venueId: number | null;

  // Bracket linking: qual partida recebe o vencedor desta
  @Column({ type: 'int', nullable: true })
  nextMatchId: number | null;

  // Em qual slot da próxima partida o vencedor entra ('home' | 'away')
  @Column({ type: 'varchar', nullable: true })
  nextMatchSlot: string | null;

  // URL (ou base64) da súmula digitalizada
  @Column({ type: 'text', nullable: true })
  sumulaUrl: string | null;
}