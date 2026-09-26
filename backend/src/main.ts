import { ValidationPipe } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module.js';
import { loadHttpsOptions } from './config/https.js';

async function bootstrap() {
  await ConfigModule.envVariablesLoaded;
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    httpsOptions: loadHttpsOptions(process.env),
  });
  const config = app.get(ConfigService);

  app.set('trust proxy', 1);
  app.use(
    helmet({
      strictTransportSecurity: config.get('NODE_ENV') === 'production',
    }),
  );
  app.use(cookieParser());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.enableCors({
    origin: config.getOrThrow<string>('FRONTEND_URL'),
    credentials: true,
  });
  app.enableShutdownHooks();

  await app.listen(config.getOrThrow<number>('PORT'));
}
await bootstrap();
