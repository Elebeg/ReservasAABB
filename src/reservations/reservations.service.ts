import { DateTime } from 'luxon';
import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, MoreThanOrEqual, Repository } from 'typeorm';
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

  const now = new Date();
  const startTimeDate = new Date(startTime);

  // Janela permitida: mínimo 2h antes, máximo 7 dias antes
  const minTime = new Date(now.getTime() + 2 * 60 * 60 * 1000);
  const maxTime = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  if (startTimeDate < minTime) {
    throw new BadRequestException(
      'A reserva deve ser feita com no mínimo 2 horas de antecedência.',
    );
  }

  if (startTimeDate > maxTime) {
    throw new BadRequestException(
      'A reserva não pode ser feita mais de 7 dias antes.',
    );
  }

  // 💡 NOVA REGRA: máximo 4 reservas ativas por usuário (só FUTURAS)
  const activeCount = await this.reservationRepo
    .createQueryBuilder('reservation')
    .where('reservation.userId = :userId', { userId: user.id })
    .andWhere('reservation.startTime >= :now', { now })
    .getCount();

  // (se quiser debugar:)
  // console.log('RESERVAS ATIVAS DO USER', user.id, '=>', activeCount);

  if (activeCount >= 4) {
    throw new BadRequestException(
      'Você já possui 4 reservas ativas. Cancele ou edite uma delas antes de criar uma nova.',
    );
  }

  // Verifica se a quadra existe
  const court = await this.courtRepo.findOne({ where: { id: courtId } });

  if (!court) {
    throw new NotFoundException('Quadra não encontrada.');
  }

  // Verifica se horário está disponível
  const isAvailable = await this.checkAvailability(courtId, startTimeDate);
  if (!isAvailable) {
    const isTournamentDay =
      await this.tournamentsService.isCourtReservedForTournament(
        courtId,
        startTimeDate,
      );

    if (isTournamentDay) {
      throw new BadRequestException(
        'Esta quadra está reservada para um torneio nesta data.',
      );
    }

    throw new BadRequestException(
      'O horário selecionado não está disponível para reserva.',
    );
  }

  const reservation = this.reservationRepo.create({
    startTime: startTimeDate,
    court,
    user,
  });

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
  
  async updateDate(
  userId: number,
  reservationId: number,
  newStartTime: Date,
): Promise<Reservation> {
  const reservation = await this.reservationRepo.findOne({
    where: { id: reservationId },
    relations: ['user', 'court'],
  });

  if (!reservation) {
    throw new NotFoundException('Reserva não encontrada.');
  }

  if (reservation.user.id !== userId) {
    throw new BadRequestException(
      'Você não tem permissão para alterar esta reserva.',
    );
  }

  const now = new Date();
  const minTime = new Date(now.getTime() + 2 * 60 * 60 * 1000);
  const maxTime = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const startTimeDate = new Date(newStartTime);

  if (startTimeDate < minTime || startTimeDate > maxTime) {
    throw new BadRequestException(
      'A nova data da reserva deve estar entre 2 horas e 7 dias a partir de agora.',
    );
  }

  // Situação de "ativo" antes e depois da alteração
  const wasActive = reservation.startTime >= now;
  const willBeActive = startTimeDate >= now;

  // 💡 Se a reserva NÃO era ativa e vai passar a ser ativa, precisamos checar o limite de 4
  if (!wasActive && willBeActive) {
    const activeCount = await this.reservationRepo
      .createQueryBuilder('reservation')
      .where('reservation.userId = :userId', { userId })
      .andWhere('reservation.startTime >= :now', { now })
      .getCount();

    // console.log('ATIVAS NO UPDATE', userId, '=>', activeCount);

    if (activeCount >= 4) {
      throw new BadRequestException(
        'Você já possui 4 reservas ativas. Cancele ou edite uma delas antes de definir uma nova data.',
      );
    }
  }


  // Verifica se o novo horário já está ocupado por outra reserva
  const isAvailable = await this.checkAvailability(
    reservation.court.id,
    startTimeDate,
  );

  if (!isAvailable) {
    // Aqui você já considera torneio dentro de checkAvailability ou logo abaixo,
    // mantive a lógica original:
    const isTournamentDay =
      await this.tournamentsService.isCourtReservedForTournament(
        reservation.court.id,
        startTimeDate,
      );

    if (isTournamentDay) {
      throw new BadRequestException(
        'Esta quadra está reservada para um torneio nesta data.',
      );
    }

    throw new BadRequestException('O horário já está reservado.');
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

