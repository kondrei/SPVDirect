import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomBytes } from 'node:crypto';
import { AccountantsService } from '../../accountants/services/accountants.service.js';
import { Accountant } from '../../accountants/accountant.entity.js';
import { hashPassword, verifyPassword } from '../../common/crypto/password.js';
import { LoginDto } from '../dto/auth.dto.js';
import {
  SESSION_AUDIENCE,
  SESSION_TTL_SECONDS,
  SessionPayload,
} from '../session.js';

export const ACCOUNT_PENDING =
  'Contul dvs. așteaptă aprobarea administratorului.';

let dummyHash: Promise<string> | undefined;

function unknownAccountHash(): Promise<string> {
  dummyHash ??= hashPassword(randomBytes(32).toString('base64'));
  return dummyHash;
}

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
    const passwordOk = await verifyPassword(
      dto.password,
      accountant?.passwordHash ?? (await unknownAccountHash()),
    );
    if (!accountant || !passwordOk) {
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

  async isSessionValid(
    accountantId: number,
    issuedAt: number | undefined,
  ): Promise<boolean> {
    const state = await this.accountants.findSessionState(accountantId);
    if (state?.status !== 'active') return false;
    if (!state.passwordChangedAt) return true;
    const changedAt = Math.floor(state.passwordChangedAt.getTime() / 1000);
    return issuedAt !== undefined && issuedAt >= changedAt;
  }
}
