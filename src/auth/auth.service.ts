import { Injectable, UnauthorizedException, ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import * as bcrypt from 'bcryptjs';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
  ) {}

  async register(dto: RegisterDto) {
    const existing = await this.usersService.findByEmail(dto.email);
    if (existing) {
      throw new ConflictException('Email already registered');
    }

    const hash = await bcrypt.hash(dto.password, 10);
    const user = await this.usersService.create({
      name: dto.name,
      email: dto.email,
      password: hash,
    });

    return { message: 'User registered successfully', userId: user.id };
  }

  async login(dto: LoginDto) {
    const user = await this.usersService.findByEmail(dto.email);
    if (!user || !(await bcrypt.compare(dto.password, user.password))) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const payload = { sub: user.id, email: user.email };
    const token = this.jwtService.sign(payload);

    return { access_token: token };
  }

  async googleLogin(user: { email: string; name: string }) {
    let existing = await this.usersService.findByEmail(user.email);
  
    if (!existing) {
      existing = await this.usersService.create({
        name: user.name,
        email: user.email,
        password: '', 
      });
    }
  
    const payload = { sub: existing.id, email: existing.email };
    const token = this.jwtService.sign(payload);
  
    return {
      message: 'Login via Google bem-sucedido',
      access_token: token,
    };
  }
  
}
