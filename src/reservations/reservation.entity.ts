import { Entity, PrimaryGeneratedColumn, Column, ManyToOne } from 'typeorm';
import { Court } from '../courts/court.entity';
import { User } from '../users/user.entity';

@Entity()
export class Reservation {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'timestamp' })
  startTime: Date;  

  @ManyToOne(() => Court, (court) => court.reservations)
  court: Court;

  @ManyToOne(() => User, (user) => user.reservations)
  user: User;
}
