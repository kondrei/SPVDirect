import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { AuthenticatedRequest } from './jwt-auth.guard.js';

@Injectable()
export class AccountantParamGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const accountantId = (req.params as Record<string, string | undefined>)
      .accountantId;
    if (!req.accountantId || accountantId !== String(req.accountantId)) {
      throw new ForbiddenException('Acces interzis pentru acest contabil');
    }
    return true;
  }
}
