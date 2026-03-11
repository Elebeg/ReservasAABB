import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import helmet from 'helmet';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: true });
  app.use(require('express').json({ limit: '2mb' }));
  app.use(require('express').urlencoded({ limit: '2mb', extended: true }));

  // ── Helmet: security headers ───────────────────────────────────────────────
  app.use(
    helmet({
      crossOriginOpenerPolicy: false, 
    }),
  );

  // ── CORS ──────────────────────────────────────────────────────────────────
  const isProd = process.env.NODE_ENV === 'production';

  const prodOrigins = [
    'https://aabbjdsreservas.com',
    'https://reservasaabb-production.up.railway.app',
  ];

  const devOrigins = [
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:5173',
  ];

  const extraOrigins = (process.env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  app.enableCors({
    origin: [...(isProd ? prodOrigins : [...prodOrigins, ...devOrigins]), ...extraOrigins],
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
    credentials: true,
    preflightContinue: false,
    optionsSuccessStatus: 204,
  });

  // ── Cross-Origin-Opener-Policy (necessário para Google OAuth popup) ────────
  app.use((_req, res, next) => {
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
    next();
  });

  // ── Validação global de DTOs ───────────────────────────────────────────────
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,             
      forbidNonWhitelisted: true,  
      transform: true,            
    }),
  );

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
