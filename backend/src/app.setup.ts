import { INestApplication, ValidationPipe } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';

export interface AppSecurityOptions {
  frontendUrl: string;
  production: boolean;
}

export function noStore(_req: Request, res: Response, next: NextFunction) {
  res.setHeader('Cache-Control', 'no-store');
  next();
}

export function configureApp(
  app: INestApplication,
  { frontendUrl, production }: AppSecurityOptions,
): void {
  app.use(helmet({ strictTransportSecurity: production }));
  app.use(noStore);
  app.use(cookieParser());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.enableCors({ origin: frontendUrl, credentials: true });
}
