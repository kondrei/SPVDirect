import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { AuthService } from '../services/auth.service.js';
import {
  parseSessionSubject,
  SESSION_AUDIENCE,
  SESSION_COOKIE,
  SessionPayload,
} from '../session.js';

export interface AuthenticatedRequest extends Request {
  accountantId: number;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly auth: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = (req.cookies as Record<string, string> | undefined)?.[
      SESSION_COOKIE
    ];
    if (!token) throw new UnauthorizedException();
    let payload: SessionPayload & { iat?: number };
    try {
      payload = await this.jwt.verifyAsync(token, {
        audience: SESSION_AUDIENCE,
      });
    } catch {
      throw new UnauthorizedException();
    }
    const accountantId = parseSessionSubject(payload.sub);
    if (
      accountantId === null ||
      !(await this.auth.isSessionValid(accountantId, payload.iat))
    ) {
      throw new UnauthorizedException();
    }
    req.accountantId = accountantId;
    return true;
  }
}
