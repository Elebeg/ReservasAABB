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

    return { access_token: token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        }
     };
  }

async googleLogin(googleUser: any) {
  if (!googleUser) {
    throw new UnauthorizedException('Usuário Google inválido');
  }

  let user = await this.usersService.findByEmail(googleUser.email);

  if (!user) {
    user = await this.usersService.create({
      email: googleUser.email,
      name: googleUser.name,
      password: Math.random().toString(36).slice(-8), 
    });
  }

  const payload = { sub: user.id, email: user.email };
  const token = await this.jwtService.signAsync(payload);

  return {
    message: 'Login via Google bem-sucedido',
    access_token: token,
  };
}

  
}
