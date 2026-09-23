import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { SESSION_AUDIENCE, SESSION_COOKIE, SessionPayload } from './session.js';

export interface AuthenticatedRequest extends Request {
  accountantId: string;
}

/** Authenticates SPVDirect's own session cookie (not ANAF tokens). */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = (req.cookies as Record<string, string> | undefined)?.[
      SESSION_COOKIE
    ];
    if (!token) throw new UnauthorizedException();
    try {
      const payload = await this.jwt.verifyAsync<SessionPayload>(token, {
        audience: SESSION_AUDIENCE,
      });
      if (typeof payload.sub !== 'string' || !payload.sub) {
        throw new UnauthorizedException();
      }
      req.accountantId = payload.sub;
      return true;
    } catch {
      throw new UnauthorizedException();
    }
  }
}
