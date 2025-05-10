import { Reservation } from 'src/reservations/reservation.entity';
import { TournamentRegistration } from 'src/tournamentRegistrations/tournament-registration.entity';
import { Entity, PrimaryGeneratedColumn, Column, OneToMany } from 'typeorm';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column({ unique: true })
  email: string;

  @Column({ nullable: true })
  password: string;

  @Column({ default: false })
  emailVerified: boolean;

  @Column({ nullable: true })
  googleId: string;

  @OneToMany(() => Reservation, (reservation) => reservation.user)
  reservations: Reservation[];

  @OneToMany(() => TournamentRegistration, registration => registration.user)
  tournamentRegistrations: TournamentRegistration[];
}