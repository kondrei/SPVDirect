import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { isProduction } from '../../common/environment.js';
import {
  cookieOptions,
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
} from '../session.js';
import { AuthService } from './auth.service.js';

@Injectable()
export class SessionCookieService {
  private readonly production: boolean;

  constructor(
    private readonly authService: AuthService,
    config: ConfigService,
  ) {
    this.production = isProduction(config);
  }

  async issue(res: Response, accountantId: number): Promise<void> {
    res.cookie(
      SESSION_COOKIE,
      await this.authService.signSession(accountantId),
      cookieOptions(SESSION_TTL_SECONDS, this.production),
    );
  }

  clear(res: Response): void {
    res.clearCookie(SESSION_COOKIE, { path: '/' });
  }
}
