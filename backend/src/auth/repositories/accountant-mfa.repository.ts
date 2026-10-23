import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, MoreThan, Not, Repository, type EntityManager } from 'typeorm';
import { AccountantMfa } from '../accountant-mfa.entity.js';
import type {
  MfaAttemptLimits,
  MfaEmailCode,
  MfaFactorDates,
} from '../dto/auth.types.js';

@Injectable()
export class AccountantMfaRepository {
  constructor(
    @InjectRepository(AccountantMfa)
    private readonly accountantMfaRepository: Repository<AccountantMfa>,
  ) {}

  findFactors(accountantId: number): Promise<MfaFactorDates | null> {
    return this.accountantMfaRepository.findOne({
      where: { accountantId },
      select: { accountantId: true, appEnabledAt: true, emailEnabledAt: true },
    });
  }

  findState(accountantId: number): Promise<AccountantMfa | null> {
    return this.accountantMfaRepository.findOne({
      where: { accountantId },
      select: {
        accountantId: true,
        secret: true,
        appEnabledAt: true,
        emailEnabledAt: true,
        lastUsedStep: true,
        failedAttempts: true,
        lockedUntil: true,
        recoveryHash: true,
        recoveryFailures: true,
        emailCodeHash: true,
        emailCodeExpiresAt: true,
      },
    });
  }

  async savePendingSecret(
    accountantId: number,
    secret: string,
  ): Promise<boolean> {
    const rows: unknown[] = await this.accountantMfaRepository.query(
      `INSERT INTO "accountant_mfa" ("accountant_id", "secret") VALUES ($1, $2)
       ON CONFLICT ("accountant_id") DO UPDATE
         SET "secret" = EXCLUDED."secret", "updated_at" = now()
         WHERE "accountant_mfa"."app_enabled_at" IS NULL
       RETURNING "accountant_id"`,
      [accountantId, secret],
    );
    return rows.length > 0;
  }

  async saveEmailCode(
    accountantId: number,
    code: MfaEmailCode,
  ): Promise<boolean> {
    const rows: unknown[] = await this.accountantMfaRepository.query(
      `INSERT INTO "accountant_mfa" ("accountant_id", "email_code_hash", "email_code_expires_at", "email_code_sent_at")
       VALUES ($1, $2, $3, $4)
       ON CONFLICT ("accountant_id") DO UPDATE
         SET "email_code_hash" = EXCLUDED."email_code_hash",
             "email_code_expires_at" = EXCLUDED."email_code_expires_at",
             "email_code_sent_at" = EXCLUDED."email_code_sent_at",
             "updated_at" = now()
         WHERE "accountant_mfa"."email_code_sent_at" IS NULL
            OR "accountant_mfa"."email_code_sent_at" <= $5
       RETURNING "accountant_id"`,
      [accountantId, code.hash, code.expiresAt, code.sentAt, code.resendBefore],
    );
    return rows.length > 0;
  }

  async clearEmailCode(
    accountantId: number,
    emailCodeHash: string,
  ): Promise<void> {
    await this.accountantMfaRepository.update(
      { accountantId, emailCodeHash },
      { emailCodeHash: null, emailCodeExpiresAt: null, emailCodeSentAt: null },
    );
  }

  async enableApp(
    manager: EntityManager,
    accountantId: number,
    step: number,
    recoveryHash: string | null,
  ): Promise<boolean> {
    const result = await manager.update(
      AccountantMfa,
      { accountantId, appEnabledAt: IsNull(), secret: Not(IsNull()) },
      {
        appEnabledAt: new Date(),
        lastUsedStep: step,
        failedAttempts: 0,
        lockedUntil: null,
        ...(recoveryHash ? { recoveryHash, recoveryFailures: 0 } : {}),
      },
    );
    return Boolean(result.affected);
  }

  async enableEmail(
    manager: EntityManager,
    accountantId: number,
    emailCodeHash: string,
    recoveryHash: string | null,
    now: Date,
  ): Promise<boolean> {
    const result = await manager.update(
      AccountantMfa,
      {
        accountantId,
        emailEnabledAt: IsNull(),
        emailCodeHash,
        emailCodeExpiresAt: MoreThan(now),
      },
      {
        emailEnabledAt: now,
        emailCodeHash: null,
        emailCodeExpiresAt: null,
        ...(recoveryHash ? { recoveryHash, recoveryFailures: 0 } : {}),
      },
    );
    return Boolean(result.affected);
  }

  async consumeEmailCode(
    accountantId: number,
    emailCodeHash: string,
    now: Date,
  ): Promise<boolean> {
    const result = await this.accountantMfaRepository.update(
      {
        accountantId,
        emailEnabledAt: Not(IsNull()),
        emailCodeHash,
        emailCodeExpiresAt: MoreThan(now),
      },
      {
        emailCodeHash: null,
        emailCodeExpiresAt: null,
        failedAttempts: 0,
        lockedUntil: null,
      },
    );
    return Boolean(result.affected);
  }

  async recordTotpSuccess(
    accountantId: number,
    step: number,
  ): Promise<boolean> {
    const result = await this.accountantMfaRepository
      .createQueryBuilder()
      .update(AccountantMfa)
      .set({
        lastUsedStep: step,
        failedAttempts: 0,
        lockedUntil: null,
        recoveryFailures: 0,
      })
      .where('accountant_id = :accountantId', { accountantId })
      .andWhere('app_enabled_at IS NOT NULL')
      .andWhere('(last_used_step IS NULL OR last_used_step < :step)', { step })
      .execute();
    return Boolean(result.affected);
  }

  async consumeRecoveryCode(
    manager: EntityManager,
    accountantId: number,
    recoveryHash: string,
  ): Promise<boolean> {
    const result = await manager.update(
      AccountantMfa,
      { accountantId, recoveryHash },
      { recoveryHash: null, failedAttempts: 0, lockedUntil: null },
    );
    return Boolean(result.affected);
  }

  async claimAttempt(
    accountantId: number,
    limits: MfaAttemptLimits,
  ): Promise<boolean> {
    const query = this.accountantMfaRepository
      .createQueryBuilder()
      .update(AccountantMfa)
      .set({
        failedAttempts: () =>
          'CASE WHEN failed_attempts + 1 >= :maxAttempts THEN 0 ELSE failed_attempts + 1 END',
        lockedUntil: () =>
          'CASE WHEN failed_attempts + 1 >= :maxAttempts THEN CAST(:lockedUntil AS timestamptz) ELSE locked_until END',
        recoveryFailures: () =>
          limits.recovery ? 'recovery_failures + 1' : 'recovery_failures',
      })
      .where('accountant_id = :accountantId', { accountantId })
      .andWhere('(app_enabled_at IS NOT NULL OR email_enabled_at IS NOT NULL)')
      .andWhere('(locked_until IS NULL OR locked_until <= :now)')
      .setParameters({
        maxAttempts: limits.maxAttempts,
        lockedUntil: limits.lockedUntil,
        now: limits.now,
      });
    if (limits.recovery) {
      query.andWhere('recovery_failures < :maxRecoveryFailures', {
        maxRecoveryFailures: limits.maxRecoveryFailures,
      });
    }
    const result = await query.execute();
    return Boolean(result.affected);
  }

  async replaceRecoveryCode(
    manager: EntityManager,
    accountantId: number,
    recoveryHash: string,
  ): Promise<boolean> {
    const result = await manager
      .createQueryBuilder()
      .update(AccountantMfa)
      .set({ recoveryHash, recoveryFailures: 0 })
      .where('accountant_id = :accountantId', { accountantId })
      .andWhere('(app_enabled_at IS NOT NULL OR email_enabled_at IS NOT NULL)')
      .execute();
    return Boolean(result.affected);
  }

  async disableApp(
    manager: EntityManager,
    accountantId: number,
  ): Promise<boolean> {
    const result = await manager
      .createQueryBuilder()
      .update(AccountantMfa)
      .set({
        secret: null,
        appEnabledAt: null,
        lastUsedStep: null,
        recoveryHash: () =>
          'CASE WHEN email_enabled_at IS NULL THEN NULL ELSE recovery_hash END',
        recoveryFailures: () =>
          'CASE WHEN email_enabled_at IS NULL THEN 0 ELSE recovery_failures END',
      })
      .where('accountant_id = :accountantId', { accountantId })
      .andWhere('app_enabled_at IS NOT NULL')
      .execute();
    return Boolean(result.affected);
  }

  async disableEmail(
    manager: EntityManager,
    accountantId: number,
  ): Promise<boolean> {
    const result = await manager
      .createQueryBuilder()
      .update(AccountantMfa)
      .set({
        emailEnabledAt: null,
        emailCodeHash: null,
        emailCodeExpiresAt: null,
        recoveryHash: () =>
          'CASE WHEN app_enabled_at IS NULL THEN NULL ELSE recovery_hash END',
        recoveryFailures: () =>
          'CASE WHEN app_enabled_at IS NULL THEN 0 ELSE recovery_failures END',
      })
      .where('accountant_id = :accountantId', { accountantId })
      .andWhere('email_enabled_at IS NOT NULL')
      .execute();
    return Boolean(result.affected);
  }

  async disableAll(
    manager: EntityManager,
    accountantId: number,
  ): Promise<boolean> {
    const result = await manager
      .createQueryBuilder()
      .delete()
      .from(AccountantMfa)
      .where('accountant_id = :accountantId', { accountantId })
      .andWhere('(app_enabled_at IS NOT NULL OR email_enabled_at IS NOT NULL)')
      .execute();
    return Boolean(result.affected);
  }

  async deleteOfAccountant(
    manager: EntityManager,
    accountantId: number,
  ): Promise<void> {
    await manager.delete(AccountantMfa, { accountantId });
  }
}
