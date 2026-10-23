import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { Request, Response } from 'express';
import { isProduction } from '../../common/environment.js';
import {
  MFA_PENDING_AUDIENCE,
  MFA_PENDING_COOKIE,
  MFA_PENDING_TTL_SECONDS,
  MFA_TRUST_AUDIENCE,
  MFA_TRUST_COOKIE,
  MFA_TRUST_TTL_SECONDS,
} from '../dto/auth.constants.js';
import type { SignedCookieClaims } from '../dto/auth.types.js';
import {
  cookieOptions,
  parseSessionSubject,
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
  type SessionPayload,
} from '../session.js';
import { AuthService } from './auth.service.js';

@Injectable()
export class SessionCookieService {
  private readonly production: boolean;

  constructor(
    private readonly authService: AuthService,
    private readonly jwtService: JwtService,
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

  issueMfaPending(res: Response, accountantId: number): Promise<void> {
    return this.issueSigned(
      res,
      MFA_PENDING_COOKIE,
      MFA_PENDING_AUDIENCE,
      MFA_PENDING_TTL_SECONDS,
      accountantId,
    );
  }

  readMfaPending(req: Request): Promise<SignedCookieClaims | null> {
    return this.readSigned(req, MFA_PENDING_COOKIE, MFA_PENDING_AUDIENCE);
  }

  clearMfaPending(res: Response): void {
    res.clearCookie(MFA_PENDING_COOKIE, { path: '/' });
  }

  issueMfaTrust(res: Response, accountantId: number): Promise<void> {
    return this.issueSigned(
      res,
      MFA_TRUST_COOKIE,
      MFA_TRUST_AUDIENCE,
      MFA_TRUST_TTL_SECONDS,
      accountantId,
    );
  }

  readMfaTrust(req: Request): Promise<SignedCookieClaims | null> {
    return this.readSigned(req, MFA_TRUST_COOKIE, MFA_TRUST_AUDIENCE);
  }

  private async issueSigned(
    res: Response,
    name: string,
    audience: string,
    ttlSeconds: number,
    accountantId: number,
  ): Promise<void> {
    const payload: SessionPayload = { sub: String(accountantId) };
    const token = await this.jwtService.signAsync(payload, {
      expiresIn: ttlSeconds,
      audience,
    });
    res.cookie(name, token, cookieOptions(ttlSeconds, this.production));
  }

  private async readSigned(
    req: Request,
    name: string,
    audience: string,
  ): Promise<SignedCookieClaims | null> {
    const token = (req.cookies as Record<string, string> | undefined)?.[name];
    if (!token) return null;
    try {
      const payload = await this.jwtService.verifyAsync<
        SessionPayload & { iat?: number }
      >(token, { audience });
      const accountantId = parseSessionSubject(payload.sub);
      return accountantId === null
        ? null
        : { accountantId, issuedAt: payload.iat };
    } catch {
      return null;
    }
  }
}
