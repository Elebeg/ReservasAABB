import { Controller, Post, Body, Get, UseGuards, Req, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { OAuth2Client } from 'google-auth-library';
import { ConfigService } from '@nestjs/config';

@Controller('auth')
export class AuthController {
  private oauthClient: OAuth2Client;

  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {
    this.oauthClient = new OAuth2Client(this.configService.get('GOOGLE_CLIENT_ID'));
  }

  // Limite mais restrito: 5 registros por minuto por IP
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  // Limite mais restrito: 10 tentativas de login por minuto por IP
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  // Google OAuth: 10 por minuto
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  @Post('google')
  async googleLogin(@Body('credential') credential: string) {
    const ticket = await this.oauthClient.verifyIdToken({
      idToken: credential,
      audience: this.configService.get('GOOGLE_CLIENT_ID'),
    });

    const payload = ticket.getPayload();
    return this.authService.googleLogin(payload);
  }

  // Controller para manter ativo o railway.
  @Get('health')
  health() {
    return { ok: true };
  }
}
