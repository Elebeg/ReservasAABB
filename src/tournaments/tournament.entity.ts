import { Entity, PrimaryGeneratedColumn, Column, ManyToMany, JoinTable, OneToMany } from 'typeorm';
import { Court } from '../courts/court.entity';
import { TournamentRegistration } from '../tournamentRegistrations/tournament-registration.entity';

@Entity()
export class Tournament {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column({ type: 'date' })
  date: Date;

  @Column({ default: 'beach_tennis' })
  type: string;

  @Column({ default: 'ativo' })
  status: string; 

  @Column({ default: false })
  isActive: boolean;

  @Column({ default: true })
  isRegistrationOpen: boolean;

  @Column({ nullable: true })
  maxParticipants: number;

  @Column({ type: 'json', nullable: true })
  maxParticipantsByGender: { male: number; female: number };

  @Column({ type: 'json', nullable: true })
  categories: string[]; 

  @ManyToMany(() => Court)
  @JoinTable()
  courts: Court[];
  
  @OneToMany(() => TournamentRegistration, registration => registration.tournament)
  registrations: TournamentRegistration[];
}