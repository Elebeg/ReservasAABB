import { Controller, Post, Body, Get, UseGuards, Req, Res } from '@nestjs/common';
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

  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Post('google')
  async googleLogin(@Body('credential') credential: string) {
  const ticket = await this.oauthClient.verifyIdToken({
    idToken: credential,
    audience: this.configService.get('GOOGLE_CLIENT_ID'),
  });

  const payload = ticket.getPayload();
  return this.authService.googleLogin(payload);
  }
}
