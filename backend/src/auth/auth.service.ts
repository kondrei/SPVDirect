import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AccountantsService } from '../accountants/accountants.service.js';
import { Accountant } from '../accountants/accountant.entity.js';
import { hashPassword, verifyPassword } from '../common/crypto/password.js';
import { isUniqueViolation } from '../common/db-errors.js';
import { LoginDto, RegisterDto } from './dto/auth.dto.js';
import {
  SESSION_AUDIENCE,
  SESSION_TTL_SECONDS,
  SessionPayload,
} from './session.js';

@Injectable()
export class AuthService {
  constructor(
    private readonly accountants: AccountantsService,
    private readonly jwt: JwtService,
  ) {}

  async register(dto: RegisterDto): Promise<Accountant> {
    if (await this.accountants.existsByEmail(dto.email)) {
      throw new ConflictException('Există deja un cont cu acest email');
    }
    try {
      return await this.accountants.create({
        email: dto.email,
        passwordHash: await hashPassword(dto.password),
        name: dto.name ?? null,
      });
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictException('Există deja un cont cu acest email');
      }
      throw err;
    }
  }

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
    return accountant;
  }

  signSession(accountantId: string): Promise<string> {
    const payload: SessionPayload = { sub: accountantId };
    return this.jwt.signAsync(payload, {
      expiresIn: SESSION_TTL_SECONDS,
      audience: SESSION_AUDIENCE,
    });
  }
}
