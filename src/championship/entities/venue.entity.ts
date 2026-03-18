import {
  Entity, PrimaryGeneratedColumn, Column,
  ManyToOne, JoinColumn,
} from 'typeorm';
import { Tournament } from './tournament.entity';

@Entity('championship_venues')
export class Venue {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column({ type: 'text', nullable: true })
  address: string | null;

  @Column({ type: 'varchar', nullable: true })
  city: string | null;

  @Column({ type: 'text', nullable: true })
  mapUrl: string | null;

  @Column({ type: 'int', nullable: true })
  capacity: number | null;

  @ManyToOne(() => Tournament, { onDelete: 'CASCADE', eager: false })
  @JoinColumn({ name: 'tournamentId' })
  tournament: Tournament;

  @Column()
  tournamentId: number;
}