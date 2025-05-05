import { Injectable, UnauthorizedException, ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import * as bcrypt from 'bcryptjs';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { OAuth2Client } from 'google-auth-library';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AuthService {
  private oauthClient: OAuth2Client;

  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {
    this.oauthClient = new OAuth2Client(configService.get('GOOGLE_CLIENT_ID'));
  }

  async register(dto: RegisterDto) {
    const existing = await this.usersService.findByEmail(dto.email);
    if (existing) {
      throw new ConflictException('Email already registered');
    }
  
    if (!dto.password) {
      throw new UnauthorizedException('Password is required');
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
      // For Google users, use googleId and set emailVerified to true
      user = await this.usersService.create({
        email: googleUser.email,
        name: googleUser.name,
        googleId: googleUser.sub, // Use Google's subject identifier
        emailVerified: true,
      });
    } else if (!user.googleId) {
      // If the user exists but hasn't linked Google yet, update their account
      user = await this.usersService.update(user.id, {
        googleId: googleUser.sub,
        emailVerified: true,
      });
    }
  
    const payload = { sub: user.id, email: user.email };
    const token = await this.jwtService.signAsync(payload);
  
    return {
      access_token: token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      }
    };
  }
  
}
