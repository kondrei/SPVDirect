import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';
import { AccountantRepository } from '../../accountants/repositories/accountant.repository.js';
import {
  mfaDisabled,
  mfaEnabled,
  mfaRecoveryRegenerated,
  mfaRecoveryUsed,
} from '../../api-logs/activity-entries.js';
import { ActivityLogsService } from '../../api-logs/activity-logs.service.js';
import { hashPassword, verifyPassword } from '../../common/crypto/password.js';
import { TokenCipher } from '../../common/crypto/token-cipher.service.js';
import {
  MFA_ALREADY_ENABLED,
  MFA_EMAIL_CODE_TTL_MS,
  MFA_EMAIL_FAILED,
  MFA_EMAIL_RESEND_MS,
  MFA_EMAIL_WAIT,
  MFA_LOCK_MS,
  MFA_LOCKED,
  MFA_LOGIN_EXPIRED,
  MFA_MAX_FAILED_ATTEMPTS,
  MFA_METHOD_OFF,
  MFA_NOT_ENABLED,
  MFA_RECOVERY_BLOCKED,
  MFA_RECOVERY_MAX_FAILURES,
  MFA_SETUP_NOT_STARTED,
  MFA_WRONG_CODE,
  MFA_WRONG_PASSWORD,
  RECOVERY_CODE_DIGITS,
  TOTP_DIGITS,
} from '../dto/auth.constants.js';
import { MfaEvent, MfaMethod } from '../dto/auth.enums.js';
import type {
  MfaEmailCodeSent,
  MfaEnabled,
  MfaFactor,
  MfaFactorDates,
  MfaRecoveryCode,
  MfaSetup,
  MfaState,
  MfaStatus,
  MfaTrustState,
  MfaVerification,
  SignedCookieClaims,
} from '../dto/auth.types.js';
import { maskEmail, newEmailCode, newRecoveryCode } from '../mfa/codes.js';
import { generateTotpSecret, matchTotp, otpauthUri } from '../mfa/totp.js';
import type { AccountantMfa } from '../accountant-mfa.entity.js';
import { AccountantMfaRepository } from '../repositories/accountant-mfa.repository.js';
import { issuedAfter } from '../session.js';
import { MfaMailer } from './mfa-mailer.service.js';

export function mfaFactors(dates: MfaFactorDates | null): MfaFactor[] {
  const factors: MfaFactor[] = [];
  if (dates?.appEnabledAt) factors.push(MfaMethod.App);
  if (dates?.emailEnabledAt) factors.push(MfaMethod.Email);
  return factors;
}

function noMfa(accountantId: number, email: string): MfaState {
  return {
    accountantId,
    email,
    secret: null,
    appEnabledAt: null,
    emailEnabledAt: null,
    lastUsedStep: null,
    failedAttempts: 0,
    lockedUntil: null,
    recoveryHash: null,
    recoveryFailures: 0,
    emailCodeHash: null,
    emailCodeExpiresAt: null,
  };
}

function withEmail(mfa: AccountantMfa, email: string): MfaState {
  return Object.assign(mfa, { email });
}

function methodOn(state: MfaState, method: MfaMethod): boolean {
  if (method === MfaMethod.App) {
    return Boolean(state.appEnabledAt && state.secret);
  }
  if (method === MfaMethod.Email) return Boolean(state.emailEnabledAt);
  return mfaFactors(state).length > 0;
}

function refusal(
  state: MfaState | null,
  method: MfaMethod,
  now: Date,
): HttpException | null {
  if (!state || !mfaFactors(state).length) {
    return new UnauthorizedException(MFA_LOGIN_EXPIRED);
  }
  if (!methodOn(state, method)) return new BadRequestException(MFA_METHOD_OFF);
  if (state.lockedUntil && state.lockedUntil > now) {
    return new ForbiddenException(MFA_LOCKED);
  }
  if (
    method === MfaMethod.Recovery &&
    state.recoveryFailures >= MFA_RECOVERY_MAX_FAILURES
  ) {
    return new ForbiddenException(MFA_RECOVERY_BLOCKED);
  }
  return null;
}

function emailCodeValid(state: MfaState, now: Date): string | null {
  const hash = state.emailCodeHash;
  const expires = state.emailCodeExpiresAt;
  return hash && expires && expires > now ? hash : null;
}

@Injectable()
export class MfaService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly accountantRepository: AccountantRepository,
    private readonly accountantMfaRepository: AccountantMfaRepository,
    private readonly tokenCipher: TokenCipher,
    private readonly activityLogsService: ActivityLogsService,
    private readonly mfaMailer: MfaMailer,
  ) {}

  async factors(accountantId: number): Promise<MfaFactor[]> {
    return mfaFactors(
      await this.accountantMfaRepository.findFactors(accountantId),
    );
  }

  async status(accountantId: number): Promise<MfaStatus> {
    const state = await this.getState(accountantId);
    const enabled = mfaFactors(state).length > 0;
    return {
      enabled,
      appEnabledAt: state.appEnabledAt,
      emailEnabledAt: state.emailEnabledAt,
      recoveryCodeAvailable:
        enabled &&
        Boolean(state.recoveryHash) &&
        state.recoveryFailures < MFA_RECOVERY_MAX_FAILURES,
    };
  }

  trustsDevice(
    accountant: MfaTrustState,
    trust: SignedCookieClaims | null,
  ): boolean {
    return (
      trust?.accountantId === accountant.id &&
      trust.issuedAt !== undefined &&
      issuedAfter(
        trust.issuedAt,
        accountant.mfaChangedAt,
        accountant.passwordChangedAt,
      )
    );
  }

  async startAppSetup(
    accountantId: number,
    password: string,
  ): Promise<MfaSetup> {
    await this.checkPassword(accountantId, password);
    const state = await this.getState(accountantId);
    if (state.appEnabledAt) throw new ConflictException(MFA_ALREADY_ENABLED);
    const secret = generateTotpSecret();
    const saved = await this.accountantMfaRepository.savePendingSecret(
      accountantId,
      this.tokenCipher.encrypt(secret),
    );
    if (!saved) throw new ConflictException(MFA_ALREADY_ENABLED);
    return { secret, otpauthUri: otpauthUri(state.email, secret) };
  }

  async confirmAppSetup(
    accountantId: number,
    code: string,
  ): Promise<MfaEnabled> {
    const state = await this.getState(accountantId);
    if (state.appEnabledAt) throw new ConflictException(MFA_ALREADY_ENABLED);
    if (!state.secret) throw new BadRequestException(MFA_SETUP_NOT_STARTED);
    const step =
      code.length === TOTP_DIGITS
        ? matchTotp(
            this.tokenCipher.decrypt(state.secret),
            code,
            Date.now(),
            null,
          )
        : null;
    if (step === null) throw new BadRequestException(MFA_WRONG_CODE);
    const recoveryCode = this.firstFactor(state) ? newRecoveryCode() : null;
    const recoveryHash = recoveryCode && (await hashPassword(recoveryCode));
    const enabled = await this.changed(accountantId, (manager) =>
      this.accountantMfaRepository.enableApp(
        manager,
        accountantId,
        step,
        recoveryHash,
      ),
    );
    if (!enabled) throw new ConflictException(MFA_ALREADY_ENABLED);
    await this.enabled(state, MfaMethod.App);
    return { recoveryCode };
  }

  async startEmailSetup(
    accountantId: number,
    password: string,
  ): Promise<MfaEmailCodeSent> {
    await this.checkPassword(accountantId, password);
    const state = await this.getState(accountantId);
    if (state.emailEnabledAt) throw new ConflictException(MFA_ALREADY_ENABLED);
    return this.sendEmailCode(state);
  }

  async confirmEmailSetup(
    accountantId: number,
    code: string,
  ): Promise<MfaEnabled> {
    const state = await this.getState(accountantId);
    if (state.emailEnabledAt) throw new ConflictException(MFA_ALREADY_ENABLED);
    const now = new Date();
    const hash = emailCodeValid(state, now);
    if (!hash) throw new BadRequestException(MFA_SETUP_NOT_STARTED);
    if (!(await verifyPassword(code, hash))) {
      throw new BadRequestException(MFA_WRONG_CODE);
    }
    const recoveryCode = this.firstFactor(state) ? newRecoveryCode() : null;
    const recoveryHash = recoveryCode && (await hashPassword(recoveryCode));
    const enabled = await this.changed(accountantId, (manager) =>
      this.accountantMfaRepository.enableEmail(
        manager,
        accountantId,
        hash,
        recoveryHash,
        now,
      ),
    );
    if (!enabled) throw new BadRequestException(MFA_SETUP_NOT_STARTED);
    await this.enabled(state, MfaMethod.Email);
    return { recoveryCode };
  }

  async sendLoginEmailCode(accountantId: number): Promise<MfaEmailCodeSent> {
    const state = await this.loadState(accountantId);
    const refused = refusal(state, MfaMethod.Email, new Date());
    if (refused || !state) {
      throw refused ?? new UnauthorizedException(MFA_LOGIN_EXPIRED);
    }
    return this.sendEmailCode(state);
  }

  async regenerateRecoveryCode(
    accountantId: number,
    password: string,
  ): Promise<MfaRecoveryCode> {
    await this.checkPassword(accountantId, password);
    const state = await this.getState(accountantId);
    const recoveryCode = newRecoveryCode();
    const recoveryHash = await hashPassword(recoveryCode);
    const replaced = await this.changed(accountantId, (manager) =>
      this.accountantMfaRepository.replaceRecoveryCode(
        manager,
        accountantId,
        recoveryHash,
      ),
    );
    if (!replaced) throw new BadRequestException(MFA_NOT_ENABLED);
    await this.activityLogsService.record(
      accountantId,
      mfaRecoveryRegenerated(),
    );
    await this.mfaMailer.notify(
      accountantId,
      state.email,
      MfaEvent.RecoveryRegenerated,
    );
    return { recoveryCode };
  }

  async disable(
    accountantId: number,
    password: string,
    method: MfaFactor | null,
  ): Promise<void> {
    await this.checkPassword(accountantId, password);
    const state = await this.getState(accountantId);
    const repo = this.accountantMfaRepository;
    let event: MfaEvent;
    let change: (manager: EntityManager) => Promise<boolean>;
    if (method === MfaMethod.App) {
      event = MfaEvent.AppDisabled;
      change = (manager) => repo.disableApp(manager, accountantId);
    } else if (method === MfaMethod.Email) {
      event = MfaEvent.EmailDisabled;
      change = (manager) => repo.disableEmail(manager, accountantId);
    } else {
      event = MfaEvent.Disabled;
      change = (manager) => repo.disableAll(manager, accountantId);
    }
    if (!(await this.changed(accountantId, change))) {
      throw new BadRequestException(method ? MFA_METHOD_OFF : MFA_NOT_ENABLED);
    }
    await this.activityLogsService.record(accountantId, mfaDisabled(method));
    await this.mfaMailer.notify(accountantId, state.email, event);
  }

  async verifyLogin(
    accountantId: number,
    code: string,
    requested?: MfaMethod,
  ): Promise<MfaVerification> {
    const method =
      requested ??
      (code.length === RECOVERY_CODE_DIGITS
        ? MfaMethod.Recovery
        : MfaMethod.App);
    const state = await this.loadState(accountantId);
    const now = new Date();
    const refused = refusal(state, method, now);
    if (refused || !state) {
      throw refused ?? new UnauthorizedException(MFA_LOGIN_EXPIRED);
    }
    await this.claimAttempt(state, method, now);
    let accepted: boolean;
    if (method === MfaMethod.Recovery) {
      accepted = await this.acceptRecovery(state, code);
    } else if (method === MfaMethod.Email) {
      accepted = await this.acceptEmailCode(state, code, now);
    } else {
      accepted = await this.acceptTotp(state, code, now);
    }
    if (!accepted) throw new UnauthorizedException(MFA_WRONG_CODE);
    return { method };
  }

  private async acceptTotp(
    state: MfaState,
    code: string,
    now: Date,
  ): Promise<boolean> {
    if (!state.secret || code.length !== TOTP_DIGITS) return false;
    const step = matchTotp(
      this.tokenCipher.decrypt(state.secret),
      code,
      now.getTime(),
      state.lastUsedStep,
    );
    if (step === null) return false;
    return this.accountantMfaRepository.recordTotpSuccess(
      state.accountantId,
      step,
    );
  }

  private async acceptEmailCode(
    state: MfaState,
    code: string,
    now: Date,
  ): Promise<boolean> {
    const hash = emailCodeValid(state, now);
    return Boolean(
      hash &&
      (await verifyPassword(code, hash)) &&
      (await this.accountantMfaRepository.consumeEmailCode(
        state.accountantId,
        hash,
        now,
      )),
    );
  }

  private async acceptRecovery(
    state: MfaState,
    code: string,
  ): Promise<boolean> {
    const hash = state.recoveryHash;
    if (
      !hash ||
      code.length !== RECOVERY_CODE_DIGITS ||
      !(await verifyPassword(code, hash))
    ) {
      return false;
    }
    const consumed = await this.changed(state.accountantId, (manager) =>
      this.accountantMfaRepository.consumeRecoveryCode(
        manager,
        state.accountantId,
        hash,
      ),
    );
    if (consumed) {
      await this.activityLogsService.record(
        state.accountantId,
        mfaRecoveryUsed(),
      );
      await this.mfaMailer.notify(
        state.accountantId,
        state.email,
        MfaEvent.RecoveryUsed,
      );
    }
    return consumed;
  }

  private changed(
    accountantId: number,
    change: (manager: EntityManager) => Promise<boolean>,
  ): Promise<boolean> {
    return this.dataSource.transaction(async (manager) => {
      if (!(await change(manager))) return false;
      await this.accountantRepository.markMfaChanged(
        manager,
        accountantId,
        new Date(),
      );
      return true;
    });
  }

  private async sendEmailCode(state: MfaState): Promise<MfaEmailCodeSent> {
    const code = newEmailCode();
    const hash = await hashPassword(code);
    const now = new Date();
    const saved = await this.accountantMfaRepository.saveEmailCode(
      state.accountantId,
      {
        hash,
        expiresAt: new Date(now.getTime() + MFA_EMAIL_CODE_TTL_MS),
        sentAt: now,
        resendBefore: new Date(now.getTime() - MFA_EMAIL_RESEND_MS),
      },
    );
    if (!saved) {
      throw new HttpException(MFA_EMAIL_WAIT, HttpStatus.TOO_MANY_REQUESTS);
    }
    try {
      await this.mfaMailer.sendCode(state.accountantId, state.email, code);
    } catch {
      await this.accountantMfaRepository.clearEmailCode(
        state.accountantId,
        hash,
      );
      throw new ServiceUnavailableException(MFA_EMAIL_FAILED);
    }
    return { sentTo: maskEmail(state.email) };
  }

  private firstFactor(state: MfaState): boolean {
    return mfaFactors(state).length === 0;
  }

  private async enabled(state: MfaState, method: MfaFactor): Promise<void> {
    await this.activityLogsService.record(
      state.accountantId,
      mfaEnabled(method),
    );
    await this.mfaMailer.notify(
      state.accountantId,
      state.email,
      method === MfaMethod.App ? MfaEvent.AppEnabled : MfaEvent.EmailEnabled,
    );
  }

  private async claimAttempt(
    state: MfaState,
    method: MfaMethod,
    now: Date,
  ): Promise<void> {
    const claimed = await this.accountantMfaRepository.claimAttempt(
      state.accountantId,
      {
        recovery: method === MfaMethod.Recovery,
        now,
        maxAttempts: MFA_MAX_FAILED_ATTEMPTS,
        lockedUntil: new Date(now.getTime() + MFA_LOCK_MS),
        maxRecoveryFailures: MFA_RECOVERY_MAX_FAILURES,
      },
    );
    if (claimed) return;
    const fresh = await this.accountantMfaRepository.findState(
      state.accountantId,
    );
    throw (
      refusal(fresh && withEmail(fresh, state.email), method, now) ??
      new ForbiddenException(MFA_LOCKED)
    );
  }

  private async checkPassword(
    accountantId: number,
    password: string,
  ): Promise<void> {
    const accountant =
      await this.accountantRepository.findWithPassword(accountantId);
    if (!accountant) throw new NotFoundException('Contul nu a fost găsit');
    if (!(await verifyPassword(password, accountant.passwordHash))) {
      throw new BadRequestException(MFA_WRONG_PASSWORD);
    }
  }

  private async loadState(accountantId: number): Promise<MfaState | null> {
    const accountant = await this.accountantRepository.findById(accountantId);
    if (!accountant) return null;
    const mfa = await this.accountantMfaRepository.findState(accountantId);
    return mfa
      ? withEmail(mfa, accountant.email)
      : noMfa(accountantId, accountant.email);
  }

  private async getState(accountantId: number): Promise<MfaState> {
    const state = await this.loadState(accountantId);
    if (!state) throw new NotFoundException('Contul nu a fost găsit');
    return state;
  }
}
