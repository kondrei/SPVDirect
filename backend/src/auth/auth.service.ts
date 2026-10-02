import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AccountantsService } from '../accountants/accountants.service.js';
import { Accountant } from '../accountants/accountant.entity.js';
import { verifyPassword } from '../common/crypto/password.js';
import { LoginDto } from './dto/auth.dto.js';
import {
  SESSION_AUDIENCE,
  SESSION_TTL_SECONDS,
  SessionPayload,
} from './session.js';

export const ACCOUNT_PENDING =
  'Contul dvs. așteaptă aprobarea administratorului.';

@Injectable()
export class AuthService {
  constructor(
    private readonly accountants: AccountantsService,
    private readonly jwt: JwtService,
  ) {}

  async validateLogin(dto: LoginDto): Promise<Accountant> {
    const accountant = await this.accountants.findByEmailWithPassword(
      dto.email,
    );
    if (
      !accountant ||
      !(await verifyPassword(dto.password, accountant.passwordHash))
    ) {
      throw new UnauthorizedException('Email sau parolă incorectă');
    }
    if (accountant.status !== 'active') {
      throw new ForbiddenException(ACCOUNT_PENDING);
    }
    return accountant;
  }

  signSession(accountantId: number): Promise<string> {
    const payload: SessionPayload = { sub: String(accountantId) };
    return this.jwt.signAsync(payload, {
      expiresIn: SESSION_TTL_SECONDS,
      audience: SESSION_AUDIENCE,
    });
  }
}
