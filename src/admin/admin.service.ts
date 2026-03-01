import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { User } from '../users/user.entity';
import { Reservation } from '../reservations/reservation.entity';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class AdminService implements OnModuleInit {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,

    @InjectRepository(Reservation)
    private readonly reservationRepo: Repository<Reservation>,

    private readonly configService: ConfigService,
  ) {}

  async onModuleInit() {
    const adminEmail = this.configService.get<string>('ADMIN_EMAIL');
    const adminPassword = this.configService.get<string>('ADMIN_PASSWORD');
    const adminName = this.configService.get<string>('ADMIN_NAME') || 'Admin';

    if (!adminEmail || !adminPassword) {
      this.logger.warn('ADMIN_EMAIL ou ADMIN_PASSWORD não definidos no .env — admin não foi criado.');
      return;
    }

    const existing = await this.userRepo.findOne({ where: { email: adminEmail } });

    if (existing) {
      this.logger.log(`Admin já existe (${adminEmail}), nenhuma ação necessária.`);
      return;
    }

    const hash = await bcrypt.hash(adminPassword, 10);

    await this.userRepo.save(
      this.userRepo.create({
        name: adminName,
        email: adminEmail,
        password: hash,
        emailVerified: true,
      }),
    );

    this.logger.log(`✅ Admin criado com sucesso (${adminEmail})`);
  }

  async getDashboardStats() {
    const totalUsers = await this.userRepo.count();
    const totalReservations = await this.reservationRepo.count();

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const reservationsToday = await this.reservationRepo.count({
      where: {
        startTime: Between(today, tomorrow),
      },
    });

    return {
      totalUsers,
      totalReservations,
      reservationsToday,
    };
  }

  async getAllUsers(): Promise<User[]> {
    return this.userRepo.find({
      order: { id: 'DESC' },
    });
  }

  async getAllReservations(): Promise<Reservation[]> {
    return this.reservationRepo.find({
      relations: ['user', 'court'],
      order: { startTime: 'DESC' },
    });
  }

  async deleteUser(id: number): Promise<void> {
    await this.userRepo.delete(id);
  }

  async deleteReservation(id: number): Promise<void> {
    await this.reservationRepo.delete(id);
  }
}
