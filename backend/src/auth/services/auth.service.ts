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
  issuedAfter,
  SessionPayload,
} from '../session.js';
import { AccountStatus } from '../../accountants/dto/accountant.enums.js';

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
    private readonly accountantsService: AccountantsService,
    private readonly jwtService: JwtService,
  ) {}

  async validateLogin(dto: LoginDto): Promise<Accountant> {
    const accountant = await this.accountantsService.findByEmailWithPassword(
      dto.email,
    );
    const passwordOk = await verifyPassword(
      dto.password,
      accountant?.passwordHash ?? (await unknownAccountHash()),
    );
    if (
      !accountant ||
      !passwordOk ||
      accountant.status === AccountStatus.Deleted
    ) {
      throw new UnauthorizedException('Email sau parolă incorectă');
    }
    if (accountant.status !== AccountStatus.Active) {
      throw new ForbiddenException(ACCOUNT_PENDING);
    }
    return accountant;
  }

  signSession(accountantId: number): Promise<string> {
    const payload: SessionPayload = { sub: String(accountantId) };
    return this.jwtService.signAsync(payload, {
      expiresIn: SESSION_TTL_SECONDS,
      audience: SESSION_AUDIENCE,
    });
  }

  async isSessionValid(
    accountantId: number,
    issuedAt: number | undefined,
  ): Promise<boolean> {
    const state = await this.accountantsService.findSessionState(accountantId);
    if (state?.status !== AccountStatus.Active) return false;
    return issuedAfter(issuedAt, state.passwordChangedAt, state.mfaChangedAt);
  }
}
