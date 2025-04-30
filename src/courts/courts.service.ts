import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Court } from './court.entity';
import { Repository } from 'typeorm';

@Injectable()
export class CourtsService implements OnModuleInit {
  constructor(
    @InjectRepository(Court)
    private courtRepo: Repository<Court>,
  ) {}

  async onModuleInit() {
    const count = await this.courtRepo.count();
    if (count === 0) {
      await this.courtRepo.save([
        { name: 'Quadra 1' },
        { name: 'Quadra 2' },
      ]);
    }
  }

  findAll() {
    return this.courtRepo.find();
  }

  findById(id: number) {
    return this.courtRepo.findOne({ where: { id } });
  }
}