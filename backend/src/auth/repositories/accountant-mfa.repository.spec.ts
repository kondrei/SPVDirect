import type { EntityManager, Repository } from 'typeorm';
import { AccountantMfa } from '../accountant-mfa.entity.js';
import { AccountantMfaRepository } from './accountant-mfa.repository.js';

function builder(affected: number) {
  const qb = {
    update: vi.fn(),
    delete: vi.fn(),
    from: vi.fn(),
    set: vi.fn(),
    where: vi.fn(),
    andWhere: vi.fn(),
    setParameters: vi.fn(),
    execute: vi.fn().mockResolvedValue({ affected }),
  };
  for (const key of [
    'update',
    'delete',
    'from',
    'set',
    'where',
    'andWhere',
    'setParameters',
  ]) {
    qb[key as 'update'].mockReturnValue(qb);
  }
  const query = vi.fn();
  const repository = new AccountantMfaRepository({
    createQueryBuilder: () => qb,
    query,
  } as unknown as Repository<AccountantMfa>);
  const manager = { createQueryBuilder: () => qb } as unknown as EntityManager;
  return { qb, query, repository, manager };
}

const limits = {
  now: new Date('2026-10-23T10:00:00Z'),
  maxAttempts: 5,
  lockedUntil: new Date('2026-10-23T10:15:00Z'),
  maxRecoveryFailures: 10,
};

describe('AccountantMfaRepository.claimAttempt', () => {
  it('counts the attempt in one conditional UPDATE that skips a locked row', async () => {
    const { qb, repository } = builder(1);
    await expect(
      repository.claimAttempt(7, { ...limits, recovery: false }),
    ).resolves.toBe(true);
    const conditions = qb.andWhere.mock.calls.map((c) => String(c[0]));
    expect(qb.where).toHaveBeenCalledWith('accountant_id = :accountantId', {
      accountantId: 7,
    });
    expect(conditions).toEqual([
      '(app_enabled_at IS NOT NULL OR email_enabled_at IS NOT NULL)',
      '(locked_until IS NULL OR locked_until <= :now)',
    ]);
    expect(qb.setParameters).toHaveBeenCalledWith({
      maxAttempts: 5,
      lockedUntil: limits.lockedUntil,
      now: limits.now,
    });
    const set = qb.set.mock.calls[0][0] as Record<string, () => string>;
    expect(set.failedAttempts()).toContain(':maxAttempts');
    expect(set.lockedUntil()).toContain(':lockedUntil');
    expect(set.recoveryFailures()).toBe('recovery_failures');
  });

  it('also stops recovery guesses at the recovery limit', async () => {
    const { qb, repository } = builder(0);
    await expect(
      repository.claimAttempt(7, { ...limits, recovery: true }),
    ).resolves.toBe(false);
    expect(qb.andWhere).toHaveBeenCalledWith(
      'recovery_failures < :maxRecoveryFailures',
      { maxRecoveryFailures: 10 },
    );
    const set = qb.set.mock.calls[0][0] as Record<string, () => string>;
    expect(set.recoveryFailures()).toBe('recovery_failures + 1');
  });
});

describe('AccountantMfaRepository.recordTotpSuccess', () => {
  it('accepts a step only once and only above the last one', async () => {
    const { qb, repository } = builder(0);
    await expect(repository.recordTotpSuccess(7, 59)).resolves.toBe(false);
    expect(qb.andWhere).toHaveBeenCalledWith(
      '(last_used_step IS NULL OR last_used_step < :step)',
      { step: 59 },
    );
    expect(qb.set).toHaveBeenCalledWith({
      lastUsedStep: 59,
      failedAttempts: 0,
      lockedUntil: null,
      recoveryFailures: 0,
    });
  });
});

describe('AccountantMfaRepository upserts', () => {
  it('creates the row for a new app secret but never replaces an active one', async () => {
    const { query, repository } = builder(0);
    query
      .mockResolvedValueOnce([{ accountant_id: 7 }])
      .mockResolvedValueOnce([]);
    await expect(repository.savePendingSecret(7, 'v1:enc')).resolves.toBe(true);
    await expect(repository.savePendingSecret(7, 'v1:enc')).resolves.toBe(
      false,
    );
    const [sql, params] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('ON CONFLICT ("accountant_id") DO UPDATE');
    expect(sql).toContain('WHERE "accountant_mfa"."app_enabled_at" IS NULL');
    expect(params).toEqual([7, 'v1:enc']);
  });

  it('saves an email code only when the last one is older than the resend wait', async () => {
    const { query, repository } = builder(0);
    query.mockResolvedValue([]);
    const code = {
      hash: 'scrypt$x',
      expiresAt: new Date('2026-10-23T10:10:00Z'),
      sentAt: new Date('2026-10-23T10:00:00Z'),
      resendBefore: new Date('2026-10-23T09:59:00Z'),
    };
    await expect(repository.saveEmailCode(7, code)).resolves.toBe(false);
    const [sql, params] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('"accountant_mfa"."email_code_sent_at" <= $5');
    expect(params).toEqual([
      7,
      code.hash,
      code.expiresAt,
      code.sentAt,
      code.resendBefore,
    ]);
  });
});

describe('AccountantMfaRepository disabling', () => {
  it('keeps the recovery code while the other method stays on', async () => {
    const app = builder(1);
    await app.repository.disableApp(app.manager, 7);
    const appSet = app.qb.set.mock.calls[0][0] as Record<string, unknown>;
    expect((appSet.recoveryHash as () => string)()).toContain(
      'WHEN email_enabled_at IS NULL THEN NULL',
    );
    expect(app.qb.andWhere).toHaveBeenCalledWith('app_enabled_at IS NOT NULL');

    const email = builder(1);
    await email.repository.disableEmail(email.manager, 7);
    const emailSet = email.qb.set.mock.calls[0][0] as Record<string, unknown>;
    expect((emailSet.recoveryHash as () => string)()).toContain(
      'WHEN app_enabled_at IS NULL THEN NULL',
    );
    expect(emailSet.emailCodeHash).toBeNull();
  });

  it('turning everything off deletes the row', async () => {
    const { qb, repository, manager } = builder(1);
    await expect(repository.disableAll(manager, 7)).resolves.toBe(true);
    expect(qb.delete).toHaveBeenCalled();
    expect(qb.from).toHaveBeenCalledWith(AccountantMfa);
  });
});
