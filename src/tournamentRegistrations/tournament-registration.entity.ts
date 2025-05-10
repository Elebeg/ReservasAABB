import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, CreateDateColumn } from 'typeorm';
import { Tournament } from '../tournaments/tournament.entity';
import { User } from '../users/user.entity';

@Entity()
export class TournamentRegistration {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Tournament, tournament => tournament.registrations)
  tournament: Tournament;

  @ManyToOne(() => User, user => user.tournamentRegistrations)
  user: User;

  @CreateDateColumn()
  registrationDate: Date;

  @Column({ nullable: true })
  category: string; 

  @Column()
  gender: 'male' | 'female';

  @Column({ nullable: true })
  partnerEmail: string; 

  @Column({ default: 'ativo' })
  status: string;
}