import {
  Entity, PrimaryGeneratedColumn, Column,
  ManyToOne, JoinColumn,
} from 'typeorm';
import { Team } from './team.entity';
import { Tournament } from './tournament.entity';

export enum PlayerPosition {
  GOALKEEPER = 'GOALKEEPER',
  DEFENDER   = 'DEFENDER',
  MIDFIELDER = 'MIDFIELDER',
  FORWARD    = 'FORWARD',
}

@Entity('championship_players')
export class Player {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  /** Número da camisa — opcional */
  @Column({ type: 'int', nullable: true })
  number: number | null;

  @Column({ type: 'enum', enum: PlayerPosition, nullable: true })
  position: PlayerPosition | null;

  /** Data de nascimento — opcional; usada para cálculo de veterano (≥ 40 anos no ano do campeonato) */
  @Column({ type: 'date', nullable: true })
  birthDate: Date | null;

  // ─── Estatísticas acumuladas ───────────────────────────────────────────
  @Column({ default: 0 }) goals:        number;
  @Column({ default: 0 }) yellowCards:  number;
  @Column({ default: 0 }) redCards:     number;

  // ─── Suspensão ────────────────────────────────────────────────────────
  /** Amarelos acumulados no ciclo atual (0 = limpo, 1 = pendurado; reseta após suspensão ou mudança de fase) */
  @Column({ default: 0 })
  yellowCardAccum: number;

  /** Suspenso para a próxima partida (vermelho ou 2º amarelo no ciclo) */
  @Column({ default: false })
  suspended: boolean;

  // ─── Relações ────────────────────────────────────────────────────────────
  @ManyToOne(() => Team, { onDelete: 'CASCADE', eager: false })
  @JoinColumn({ name: 'teamId' })
  team: Team;

  @Column()
  teamId: number;

  @ManyToOne(() => Tournament, { onDelete: 'CASCADE', eager: false })
  @JoinColumn({ name: 'tournamentId' })
  tournament: Tournament;

  @Column()
  tournamentId: number;
}