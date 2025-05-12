import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './user.entity';
import { CreateUserDto } from './dto/create-user.dto';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  async create(userData: CreateUserDto) {
    if (!userData.googleId && !userData.password) {
      throw new Error('Password is required for standard registration');
    }
    
    const user = this.userRepo.create(userData);
    return this.userRepo.save(user);
  }

  async findAll(): Promise<User[]> {
    return this.userRepo.find();
  }  

  async findByEmail(email: string): Promise<User | null> {
    return this.userRepo.findOne({ where: { email } });
  }

  async findById(id: number): Promise<User | null> {
    return this.userRepo.findOne({ where: { id } });
  }

  async update(id: number, updateData: Partial<User>): Promise<User> {
    await this.userRepo.update(id, updateData);
    const updatedUser = await this.userRepo.findOne({ where: { id } });
    
    if (!updatedUser) {
      throw new Error(`User with ID ${id} not found after update`);
    }
    
    return updatedUser;
  }
}