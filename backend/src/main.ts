import { ConfigModule, ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';
import { configureApp } from './app.setup.js';
import { isProduction } from './common/environment.js';
import { loadHttpsOptions } from './config/https.js';

async function bootstrap() {
  await ConfigModule.envVariablesLoaded;
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    httpsOptions: loadHttpsOptions(process.env),
  });
  const config = app.get(ConfigService);

  const production = isProduction(config);
  if (production) app.set('trust proxy', 1);
  configureApp(app, {
    frontendUrl: config.getOrThrow<string>('FRONTEND_URL'),
    production,
  });
  app.enableShutdownHooks();

  await app.listen(config.getOrThrow<number>('PORT'));
}
await bootstrap();
