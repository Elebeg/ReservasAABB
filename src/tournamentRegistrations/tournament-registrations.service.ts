import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TournamentRegistration } from './tournament-registration.entity';
import { Tournament } from '../tournaments/tournament.entity';
import { User } from '../users/user.entity';
import { CreateTournamentRegistrationDto } from './dto/create-tournament-registrations.dto';
import { UpdateTournamentRegistrationDto } from './dto/update-tournament-registrations.dto';
import { UsersService } from '../users/users.service';
import { TournamentsService } from '../tournaments/tournaments.service';

@Injectable()
export class TournamentRegistrationsService {
  constructor(
    @InjectRepository(TournamentRegistration)
    private registrationRepo: Repository<TournamentRegistration>,
    @InjectRepository(Tournament)
    private tournamentRepo: Repository<Tournament>,
    @InjectRepository(User)
    private userRepo: Repository<User>,
    private tournamentsService: TournamentsService,
    private usersService: UsersService,
  ) {}

  async register(
    userId: number,
    createDto: CreateTournamentRegistrationDto,
  ): Promise<TournamentRegistration> {
    const { tournamentId, category, partnerEmail, gender } = createDto;
  
    // Usar métodos privados de validação
    const user = await this.validateUser(userId);
    const tournament = await this.validateTournament(tournamentId);
  
    // Verificar se o usuário já está inscrito
    const existingRegistration = await this.registrationRepo.findOne({
      where: {
        tournament: { id: tournamentId },
        user: { id: userId },
      },
    });
  
    if (existingRegistration) {
      throw new BadRequestException('Você já está inscrito neste torneio');
    }
  
    if (tournament.maxParticipantsByGender) {
        const genderCount = await this.registrationRepo.count({
          where: { 
            tournament: { id: tournamentId },
            gender: gender, // Contabiliza o gênero do jogador
          },
        });
    
        if (gender === 'male' && genderCount >= tournament.maxParticipantsByGender.male) {
          throw new BadRequestException('O limite de inscrições masculinas foi atingido');
        }
    
        if (gender === 'female' && genderCount >= tournament.maxParticipantsByGender.female) {
          throw new BadRequestException('O limite de inscrições femininas foi atingido');
        }
      }
  
      //validar status torneio
      if (tournament.status === 'finalizado') {
        throw new BadRequestException('Este torneio foi finalizado e não aceita mais inscrições');
      }
  
    // Validar categoria
    if (category) {
        this.validateCategory(category);
      }
  
    let partnerUser: User | null = null;

    // Validar parceiro, se fornecido
    if (partnerEmail) {
      partnerUser = await this.validatePartner(partnerEmail, tournamentId, user);
    }    
  
  // Cria a inscrição principal (usuário atual)
  const registration = this.registrationRepo.create({
    tournament,
    user,
    gender,
    partnerEmail,
    category,
  });
  await this.registrationRepo.save(registration);

   return registration;
  }

async findByUser(userId: number): Promise<TournamentRegistration[]> {
  const user = await this.validateUser(userId);
  
  return this.registrationRepo.find({
    where: [
      { user: { id: userId } },
      { partnerEmail: user.email },
    ],
    relations: ['tournament', 'user'],
    order: { registrationDate: 'DESC' },
  });
}


  async findByTournament(tournamentId: number): Promise<TournamentRegistration[]> {
    return this.registrationRepo.find({
      where: { tournament: { id: tournamentId } },
      relations: ['user'],
      order: { registrationDate: 'ASC' },
    });
  }

  async findById(id: number): Promise<TournamentRegistration> {
    const registration = await this.registrationRepo.findOne({
      where: { id },
      relations: ['tournament', 'user'],
    });

    if (!registration) {
      throw new NotFoundException('Inscrição não encontrada');
    }

    return registration;
  }

  async update(
    userId: number,
    registrationId: number,
    updateDto: UpdateTournamentRegistrationDto,
  ): Promise<TournamentRegistration> {
    const { category, partnerEmail } = updateDto;
  
    const user = await this.validateUser(userId);
    const registration = await this.findById(registrationId);
  
    // Verificar se a inscrição pertence ao usuário
    if (registration.user.id !== userId) {
      throw new BadRequestException('Você não tem permissão para atualizar esta inscrição');
    }
  
    // Validar torneio
    const tournament = await this.validateTournament(registration.tournament.id);
  
    // Validar categoria
    const allowedCategories = ['A', 'B', 'C', 'D'];
    if (category && !allowedCategories.includes(category)) {
      throw new BadRequestException('Categoria inválida. Use A, B, C ou D.');
    }
  
    // Validar parceiro se informado
    if (partnerEmail) {
      await this.validatePartner(partnerEmail, tournament.id, user);
      registration.partnerEmail = partnerEmail;
    }
  
    if (category) {
      (registration as any).category = category; 
    }
  
    return this.registrationRepo.save(registration);
  }

  async cancel(userId: number, registrationId: number): Promise<void> {
    const registration = await this.findById(registrationId);

    // Verificar se a inscrição pertence ao usuário
    if (registration.user.id !== userId) {
      throw new BadRequestException('Você não tem permissão para cancelar esta inscrição');
    }

    // Verificar se o torneio ainda não aconteceu
    const tournament = registration.tournament;
    const now = new Date();
    const tournamentDate = new Date(tournament.date);

    if (tournamentDate < now) {
      throw new BadRequestException('Não é possível cancelar a inscrição após o torneio ter ocorrido');
    }

    await this.registrationRepo.remove(registration);
  }

  private async validateUser(userId: number): Promise<User> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('Usuário não encontrado');
    return user;
  }
  
  private async validateTournament(tournamentId: number): Promise<Tournament> {
    const tournament = await this.tournamentRepo.findOne({
      where: { id: tournamentId },
      relations: ['registrations'],
    });
    if (!tournament) throw new NotFoundException('Torneio não encontrado');
    if (!tournament.isActive) throw new BadRequestException('O torneio não está ativo');
    if (!tournament.isRegistrationOpen) throw new BadRequestException('As inscrições estão fechadas');
    return tournament;
  }
  
  private async validatePartner(partnerEmail: string, tournamentId: number, user: User): Promise<User> {
    const partner = await this.userRepo.findOne({ where: { email: partnerEmail } });
    if (!partner) throw new BadRequestException('Parceiro não encontrado com o email fornecido');
  
    const existing = await this.registrationRepo.findOne({
      where: {
        tournament: { id: tournamentId },
        partnerEmail: user.email,
      },
    });
    if (existing) throw new BadRequestException('Este parceiro já está inscrito com outro jogador');
  
    return partner;
  }

  private validateCategory(category: string | undefined) {
    const allowedCategories = ['A', 'B', 'C', 'D'];
    if (category && !allowedCategories.includes(category)) {
      throw new BadRequestException('Categoria inválida.');
    }
  }  
  
}