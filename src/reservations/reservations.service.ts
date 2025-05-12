import { DateTime } from 'luxon';
import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { Reservation } from './reservation.entity';
import { Court } from '../courts/court.entity';
import { User } from '../users/user.entity';
import { CreateReservationDto } from './dto/create-reservation.dto';
import { Cron, CronExpression } from '@nestjs/schedule';
import { TournamentsService } from 'src/tournaments/tournaments.service';
import { UpdateReservationDto } from './dto/update-reservation.dto';

@Injectable()
export class ReservationsService {
  constructor(
    @InjectRepository(Reservation)
    private reservationRepo: Repository<Reservation>,
    @InjectRepository(Court)
    private courtRepo: Repository<Court>,
    @InjectRepository(User)
    private userRepo: Repository<User>,
    private tournamentsService: TournamentsService,
  ) {}

  async checkAvailability(courtId: number, startTime: Date): Promise<boolean> {
    const conflictingReservation = await this.reservationRepo.findOne({
      where: { court: { id: courtId }, startTime },
    });
    
    if (conflictingReservation) {
      return false;
    }
    
    const isTournamentDay = await this.tournamentsService.isCourtReservedForTournament(
      courtId,
      startTime
    );
    
    return !isTournamentDay;
  }

  async create(user: User, createReservationDto: CreateReservationDto): Promise<Reservation> {
    const { courtId, startTime } = createReservationDto;

    const currentTime = new Date();
    
    const startTimeDate = new Date(startTime);

    const minTime = new Date(currentTime.getTime() + 2 * 60 * 60 * 1000);
    const maxTime = new Date(currentTime.getTime() + 7 * 24 * 60 * 60 * 1000); 

    if (startTimeDate < minTime) {
      throw new BadRequestException('A reserva deve ser feita com no mínimo 2 horas de antecedência.');
    }
    if (startTimeDate > maxTime) {
      throw new BadRequestException('A reserva não pode ser feita mais de 7 dias antes.');
    }

    const startInBrasilia = DateTime.fromJSDate(startTimeDate).setZone('America/Sao_Paulo');

    const hour = startInBrasilia.hour;

    if (hour < 8 || hour >= 22) {
      throw new BadRequestException('As reservas só podem ser feitas entre 08:00 e 22:00 (horário de Brasília).');
    }

    const court = await this.courtRepo.findOne({
        where: { id: courtId },
      });
      
    if (!court) {
      throw new NotFoundException('Quadra não encontrada.');
    }
      
    const isAvailable = await this.checkAvailability(courtId, startTimeDate);
    if (!isAvailable) {
      const isTournamentDay = await this.tournamentsService.isCourtReservedForTournament(
        courtId,
        startTimeDate
      );
      
      if (isTournamentDay) {
        throw new BadRequestException('Esta quadra está reservada para um torneio nesta data.');
      } else {
        throw new BadRequestException('O horário selecionado já está reservado.');
      }
    }

    const dbUser = await this.userRepo.findOne({ where: { email: user.email } });

    if (!dbUser) {
      throw new NotFoundException('Usuário não encontrado.');
    }

    const reservation = this.reservationRepo.create({
        user: dbUser,
        court,
        startTime: startTimeDate,
      });
      
      console.log('Reserva a ser salva:', reservation);
      
      return this.reservationRepo.save(reservation);
  }

  async findAll(): Promise<Reservation[]> {
    return this.reservationRepo.find({
      relations: ['court', 'user'],
      order: { startTime: 'ASC' },
    });
  }

  async findByUser(userId: number): Promise<Reservation[]> {
    return this.reservationRepo.find({
      where: { user: { id: userId } },
      relations: ['court'],
      order: { startTime: 'ASC' },
    });
  }
  
  async updateDate(userId: number, reservationId: number, newStartTime: Date): Promise<Reservation> {
    const reservation = await this.reservationRepo.findOne({
      where: { id: reservationId },
      relations: ['user', 'court'],
    });
  
    if (!reservation) {
      throw new NotFoundException('Reserva não encontrada.');
    }
  
    if (reservation.user.id !== userId) {
      throw new BadRequestException('Você não tem permissão para alterar esta reserva.');
    }
  
    const now = new Date();
    const minTime = new Date(now.getTime() + 2 * 60 * 60 * 1000);
    const maxTime = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  
    const startTimeDate = new Date(newStartTime);
    if (startTimeDate < minTime || startTimeDate > maxTime) {
      throw new BadRequestException('A nova data está fora do intervalo permitido.');
    }
  
    const startInBrasilia = DateTime.fromJSDate(startTimeDate).setZone('America/Sao_Paulo');
    const hour = startInBrasilia.hour;
  
    if (hour < 8 || hour >= 22) {
      throw new BadRequestException('O horário permitido é entre 08:00 e 22:00.');
    }
  
    const isAvailable = await this.checkAvailability(reservation.court.id, startTimeDate);
    if (!isAvailable) {
      throw new BadRequestException('O horário já está reservado.');
    }

    const isTournamentDay = await this.tournamentsService.isCourtReservedForTournament(
      reservation.court.id,
      newStartTime
    );
    
    if (isTournamentDay) {
      throw new BadRequestException('Esta quadra está reservada para um torneio nesta data.');
    }
  
    reservation.startTime = startTimeDate;
    return this.reservationRepo.save(reservation);
  }
  
  async deleteByUser(userId: number, reservationId: number): Promise<void> {
    const reservation = await this.reservationRepo.findOne({
      where: { id: reservationId },
      relations: ['user'],
    });
  
    if (!reservation) {
      throw new NotFoundException('Reserva não encontrada.');
    }
  
    if (reservation.user.id !== userId) {
      throw new BadRequestException('Você não tem permissão para excluir esta reserva.');
    }
  
    await this.reservationRepo.remove(reservation);
  }

  @Cron('0 3 * * *', { name: 'remove-past-reservations' }) 
  async removePastReservations(): Promise<void> {
    const now = new Date();
    await this.reservationRepo.delete({
      startTime: LessThan(now),
    });
    console.log('[CronJob] Reservas antigas removidas com sucesso');
  }  
}

