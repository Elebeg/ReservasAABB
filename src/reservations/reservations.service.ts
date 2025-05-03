import { DateTime } from 'luxon';
import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { Reservation } from './reservation.entity';
import { Court } from '../courts/court.entity';
import { User } from '../users/user.entity';
import { CreateReservationDto } from './dto/create-reservation.dto';
import { UpdateReservationDto } from './dto/update-reservation.dto';
import { Cron, CronExpression } from '@nestjs/schedule';

@Injectable()
export class ReservationsService {
  constructor(
    @InjectRepository(Reservation)
    private reservationRepo: Repository<Reservation>,
    @InjectRepository(Court)
    private courtRepo: Repository<Court>,
    @InjectRepository(User)
    private userRepo: Repository<User>,
  ) {}

  async checkAvailability(courtId: number, startTime: Date): Promise<boolean> {
    const conflictingReservation = await this.reservationRepo.findOne({
      where: { court: { id: courtId }, startTime },
    });
    return !conflictingReservation;
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
      throw new BadRequestException('O horário selecionado já está reservado.');
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

  async findUserReservations(user: User): Promise<Reservation[]> {
    console.log('Buscando reservas para o usuário:', user.id, user.email);
    
    return this.reservationRepo.find({
      where: { user: { id: user.id } },
      relations: ['court', 'user'],
      order: { startTime: 'ASC' },
    });
  } 

  async update(user: User, id: number, updateReservationDto: UpdateReservationDto): Promise<Reservation> {
    console.log('Recebendo solicitação de atualização:', id, updateReservationDto);
    
    const reservation = await this.reservationRepo.findOne({
      where: { id },
      relations: ['user'],
    });
  
    if (!reservation) {
      throw new NotFoundException('Reserva não encontrada.');
    }
  
    if (reservation.user.id !== user.id) {
      throw new BadRequestException('Você não pode alterar reservas de outros usuários.');
    }
  
    const newStartTime = new Date(updateReservationDto.startTime);
    console.log('Data recebida:', updateReservationDto.startTime);
    console.log('Data convertida:', newStartTime);
  
    if (isNaN(newStartTime.getTime())) {
      throw new BadRequestException('Formato de data inválido');
    }
  
    const startInBrasilia = DateTime.fromJSDate(newStartTime).setZone('America/Sao_Paulo');
    const hour = startInBrasilia.hour;
  
    if (hour < 8 || hour >= 22) {
      throw new BadRequestException('As reservas só podem ser feitas entre 08:00 e 22:00 (horário de Brasília).');
    }
  
    const isAvailable = await this.checkAvailability(reservation.court.id, newStartTime);
    if (!isAvailable && new Date(reservation.startTime).getTime() !== newStartTime.getTime()) {
      throw new BadRequestException('O horário selecionado já está reservado.');
    }
  
    reservation.startTime = newStartTime;
    return this.reservationRepo.save(reservation);
  }

  async remove(user: User, id: number): Promise<void> {
    const reservation = await this.reservationRepo.findOne({
      where: { id },
      relations: ['user'],
    });

    if (!reservation) {
      throw new NotFoundException('Reserva não encontrada.');
    }

    console.log('ID do usuário da reserva:', reservation.user.id);
    console.log('ID do usuário autenticado:', user.id);

    if (reservation.user.id !== user.id) {
      throw new BadRequestException('Você não pode excluir reservas de outros usuários.');
    }

    await this.reservationRepo.remove(reservation);
  }

  async findAll(): Promise<Reservation[]> {
    return this.reservationRepo.find({
      relations: ['court', 'user'],
      order: { startTime: 'ASC' },
    });
  }

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT, { name: 'remove-past-reservations' })
  async removePastReservations(): Promise<void> {
    const now = new Date();
    await this.reservationRepo.delete({
      startTime: LessThan(now),
    });
    console.log('[CronJob] Reservas antigas removidas com sucesso');
  }  
}