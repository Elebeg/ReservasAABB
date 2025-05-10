import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, MoreThan } from 'typeorm';
import { Tournament } from './tournament.entity';
import { Court } from '../courts/court.entity';
import { CreateTournamentDto } from './dto/create-tournament.dto';
import { UpdateTournamentDto } from './dto/update-tournament.dto';
import { TournamentRegistration } from 'src/tournamentRegistrations/tournament-registration.entity';
import { Cron, CronExpression } from '@nestjs/schedule';

@Injectable()
export class TournamentsService {
  constructor(
    @InjectRepository(Tournament)
    private tournamentRepo: Repository<Tournament>,
    @InjectRepository(Court)
    private courtRepo: Repository<Court>,
    @InjectRepository(TournamentRegistration)
    private registrationRepo: Repository<TournamentRegistration> 
  ) {}

  async create(createTournamentDto: CreateTournamentDto): Promise<Tournament> {
    const { name, date, courtIds, type, isRegistrationOpen, maxParticipants, maxParticipantsByGender, categories } = createTournamentDto;
    
    // Verificar se já existe torneio na mesma data
    const existingTournament = await this.findByDate(new Date(date));
    if (existingTournament) {
      throw new BadRequestException('Já existe um torneio nesta data');
    }

    // Buscar quadras
    const courts = await this.courtRepo.findByIds(courtIds);
    if (courts.length !== courtIds.length) {
      throw new BadRequestException('Uma ou mais quadras não foram encontradas');
    }

    const tournament = this.tournamentRepo.create({
      name,
      date: new Date(date),
      type,
      isActive: true,
      isRegistrationOpen: isRegistrationOpen ?? true,
      maxParticipants,
      maxParticipantsByGender,
      categories,
      courts
    });

    return this.tournamentRepo.save(tournament);
  }

  async findAll(): Promise<Tournament[]> {
    return this.tournamentRepo.find({
      relations: ['courts', 'registrations'],
    });
  }

  async findById(id: number): Promise<Tournament> {
    const tournament = await this.tournamentRepo.findOne({
      where: { id },
      relations: ['courts', 'registrations', 'registrations.user'],
    });

    if (!tournament) {
      throw new NotFoundException('Torneio não encontrado');
    }

    return tournament;
  }

  async findByDate(date: Date): Promise<Tournament | null> {
    // Começando do dia às 00:00
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    
    // Até o fim do dia às 23:59:59
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    return this.tournamentRepo.findOne({
      where: { 
        date: Between(startOfDay, endOfDay),
        isActive: true
      },
      relations: ['courts'],
    });
  }
  
  async findNext(): Promise<Tournament | null> {
    const now = new Date();
    
    // Buscar o próximo torneio ativo que ainda não aconteceu
    return this.tournamentRepo.findOne({
      where: {
        date: MoreThan(now),
        isActive: true
      },
      relations: ['courts'],
      order: {
        date: 'ASC'
      }
    });
  }

  async update(id: number, updateTournamentDto: UpdateTournamentDto): Promise<Tournament> {
    const tournament = await this.findById(id);
    
    if (updateTournamentDto.name) {
      tournament.name = updateTournamentDto.name;
    }
    
    if (updateTournamentDto.date) {
      tournament.date = new Date(updateTournamentDto.date);
    }
    
    if (updateTournamentDto.type) {
      tournament.type = updateTournamentDto.type;
    }
    
    if (updateTournamentDto.isActive !== undefined) {
      tournament.isActive = updateTournamentDto.isActive;
    }
    
    if (updateTournamentDto.isRegistrationOpen !== undefined) {
      tournament.isRegistrationOpen = updateTournamentDto.isRegistrationOpen;
    }
    
    if (updateTournamentDto.maxParticipants !== undefined) {
      tournament.maxParticipants = updateTournamentDto.maxParticipants;
    }
    
    if (updateTournamentDto.categories) {
      tournament.categories = updateTournamentDto.categories;
    }
    
    if (updateTournamentDto.courtIds) {
      const courts = await this.courtRepo.findByIds(updateTournamentDto.courtIds);
      if (courts.length !== updateTournamentDto.courtIds.length) {
        throw new BadRequestException('Uma ou mais quadras não foram encontradas');
      }
      tournament.courts = courts;
    }
    
    return this.tournamentRepo.save(tournament);
  }

  async toggleRegistrationStatus(id: number): Promise<Tournament> {
    const tournament = await this.findById(id);
    tournament.isRegistrationOpen = !tournament.isRegistrationOpen;
    return this.tournamentRepo.save(tournament);
  }

  async remove(id: number): Promise<void> {
    const tournament = await this.findById(id);
    await this.tournamentRepo.remove(tournament);
  }

  async isCourtReservedForTournament(courtId: number, date: Date): Promise<boolean> {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const tournament = await this.tournamentRepo.createQueryBuilder('tournament')
      .innerJoinAndSelect('tournament.courts', 'court')
      .where('tournament.date BETWEEN :startOfDay AND :endOfDay', { startOfDay, endOfDay })
      .andWhere('court.id = :courtId', { courtId })
      .andWhere('tournament.isActive = true')
      .getOne();

    return !!tournament;
  }

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async handleCron() {
    const now = new Date();
    const tournaments = await this.tournamentRepo.find(); // Pega todos os torneios

    for (const tournament of tournaments) {
      // Verifica se a data do torneio já passou
      if (tournament.date < now && tournament.status !== 'finalizado') {
        tournament.status = 'finalizado';
        tournament.isRegistrationOpen = false;

        // Salva o torneio com o novo status
        await this.tournamentRepo.save(tournament);

        // Finaliza todas as inscrições do torneio
        for (const registration of tournament.registrations) {
          registration.status = 'finalizado';
          await this.registrationRepo.save(registration);
        }

        console.log(`Torneio ${tournament.name} finalizado!`);
      }
    }
  }

  async onModuleInit() {
    const tournamentDate = new Date(Date.UTC(2025, 4, 18));
    const existingTournament = await this.findByDate(tournamentDate);
    
    if (!existingTournament) {
      const allCourts = await this.courtRepo.find();
      
      await this.tournamentRepo.save({
        name: 'Torneio de Beach Tennis',
        date: tournamentDate,
        type: 'beach_tennis',
        isActive: true,
        isRegistrationOpen: true,
        maxParticipants: 64, //16 //32 //64
        maxParticipantsByGender: { male: 32, female: 32 },
        categories: ['A', 'B', 'C', 'D'],
        courts: allCourts
      });
      
      console.log('Torneio de Beach Tennis criado para 17/05/2025');
    }
  }
}