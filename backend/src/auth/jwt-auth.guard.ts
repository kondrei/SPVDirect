import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import {
  parseSessionSubject,
  SESSION_AUDIENCE,
  SESSION_COOKIE,
  SessionPayload,
} from './session.js';

export interface AuthenticatedRequest extends Request {
  accountantId: number;
}

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
      const accountantId = parseSessionSubject(payload.sub);
      if (accountantId === null) throw new UnauthorizedException();
      req.accountantId = accountantId;
      return true;
    } catch {
      throw new UnauthorizedException();
    }
  }
}
