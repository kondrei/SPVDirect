import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'node:crypto';
import type { AccountantRepository } from '../../accountants/repositories/accountant.repository.js';
import type { ActivityLogsService } from '../../api-logs/activity-logs.service.js';
import { ActivityAction } from '../../api-logs/dto/api-log.enums.js';
import { hashPassword, verifyPassword } from '../../common/crypto/password.js';
import { TokenCipher } from '../../common/crypto/token-cipher.service.js';
import { fakeActivityLogs } from '../../testing/activity-logs.js';
import {
  MFA_EMAIL_CODE_TTL_MS,
  MFA_EMAIL_RESEND_MS,
  MFA_EMAIL_WAIT,
  MFA_LOCK_MS,
  MFA_LOCKED,
  MFA_MAX_FAILED_ATTEMPTS,
  MFA_METHOD_OFF,
  MFA_RECOVERY_BLOCKED,
  MFA_RECOVERY_MAX_FAILURES,
  MFA_WRONG_CODE,
} from '../dto/auth.constants.js';
import { MfaEvent, MfaMethod } from '../dto/auth.enums.js';
import type { MfaEmailCode, MfaState } from '../dto/auth.types.js';
import { generateTotpSecret, totpCode, totpStep } from '../mfa/totp.js';
import type { DataSource } from 'typeorm';
import type { AccountantMfaRepository } from '../repositories/accountant-mfa.repository.js';
import type { MfaMailer } from './mfa-mailer.service.js';
import { mfaFactors, MfaService } from './mfa.service.js';

const cipher = new TokenCipher(
  new ConfigService({
    TOKEN_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
  }),
);
const password = 'a-long-password';
const secret = generateTotpSecret();
const soon = () => new Date(Date.now() + 60_000);

function state(overrides: Partial<MfaState> = {}): MfaState {
  return {
    accountantId: 7,
    email: 'ana@example.ro',
    secret: cipher.encrypt(secret),
    appEnabledAt: new Date('2026-10-01T00:00:00Z'),
    emailEnabledAt: null,
    lastUsedStep: null,
    failedAttempts: 0,
    lockedUntil: null,
    recoveryHash: null,
    recoveryFailures: 0,
    emailCodeHash: null,
    emailCodeExpiresAt: null,
    ...overrides,
  };
}

const off = (overrides: Partial<MfaState> = {}) =>
  state({ appEnabledAt: null, secret: null, ...overrides });

const manager = { tx: true };

async function setup(stored: MfaState | null = state()) {
  const accountants = {
    findById: vi.fn().mockResolvedValue({ id: 7, email: 'ana@example.ro' }),
    findWithPassword: vi
      .fn()
      .mockResolvedValue({ id: 7, passwordHash: await hashPassword(password) }),
    markMfaChanged: vi.fn().mockResolvedValue(undefined),
  };
  const dataSource = {
    transaction: vi.fn((work: (m: unknown) => Promise<unknown>) =>
      work(manager),
    ),
  };
  const repo = {
    findState: vi.fn().mockResolvedValue(stored),
    savePendingSecret: vi.fn().mockResolvedValue(true),
    enableApp: vi.fn().mockResolvedValue(true),
    saveEmailCode: vi.fn().mockResolvedValue(true),
    clearEmailCode: vi.fn().mockResolvedValue(undefined),
    enableEmail: vi.fn().mockResolvedValue(true),
    consumeEmailCode: vi.fn().mockResolvedValue(true),
    recordTotpSuccess: vi.fn().mockResolvedValue(true),
    consumeRecoveryCode: vi.fn().mockResolvedValue(true),
    claimAttempt: vi.fn().mockResolvedValue(true),
    replaceRecoveryCode: vi.fn().mockResolvedValue(true),
    disableApp: vi.fn().mockResolvedValue(true),
    disableEmail: vi.fn().mockResolvedValue(true),
    disableAll: vi.fn().mockResolvedValue(true),
  };
  const activity = fakeActivityLogs();
  const mailer = {
    notify: vi.fn().mockResolvedValue(undefined),
    sendCode: vi.fn().mockResolvedValue(undefined),
  };
  const service = new MfaService(
    dataSource as unknown as DataSource,
    accountants as unknown as AccountantRepository,
    repo as unknown as AccountantMfaRepository,
    cipher,
    activity as unknown as ActivityLogsService,
    mailer as unknown as MfaMailer,
  );
  return { service, repo, accountants, activity, mailer };
}

const currentCode = () => totpCode(secret, totpStep(Date.now()));

describe('mfaFactors', () => {
  it('lists the methods that are on', () => {
    const at = new Date();
    expect(mfaFactors({ appEnabledAt: null, emailEnabledAt: null })).toEqual(
      [],
    );
    expect(mfaFactors({ appEnabledAt: at, emailEnabledAt: at })).toEqual([
      MfaMethod.App,
      MfaMethod.Email,
    ]);
    expect(mfaFactors({ appEnabledAt: null, emailEnabledAt: at })).toEqual([
      MfaMethod.Email,
    ]);
  });
});

describe('MfaService.status', () => {
  it('reports each method and a recovery code only while usable', async () => {
    const hash = await hashPassword('12345');
    const at = new Date('2026-10-02T00:00:00Z');
    const cases: [MfaState, boolean, boolean][] = [
      [off(), false, false],
      [state({ recoveryHash: hash }), true, true],
      [off({ emailEnabledAt: at, recoveryHash: hash }), true, true],
      [state({ recoveryHash: null }), true, false],
      [state({ recoveryHash: hash, recoveryFailures: 10 }), true, false],
    ];
    for (const [stored, enabled, available] of cases) {
      const { service } = await setup(stored);
      await expect(service.status(7)).resolves.toMatchObject({
        enabled,
        appEnabledAt: stored.appEnabledAt,
        emailEnabledAt: stored.emailEnabledAt,
        recoveryCodeAvailable: available,
      });
    }
  });
});

describe('MfaService app setup', () => {
  it('needs the password before it creates a secret', async () => {
    const { service, repo } = await setup(off());
    await expect(service.startAppSetup(7, 'wrong-password')).rejects.toThrow(
      BadRequestException,
    );
    expect(repo.savePendingSecret).not.toHaveBeenCalled();
  });

  it('stores the new secret encrypted and returns it with the otpauth URI', async () => {
    const { service, repo } = await setup(off());
    const result = await service.startAppSetup(7, password);
    expect(result.secret).toMatch(/^[A-Z2-7]{32}$/);
    expect(result.otpauthUri).toContain(`secret=${result.secret}`);
    const [, stored] = repo.savePendingSecret.mock.calls[0] as [number, string];
    expect(stored).not.toContain(result.secret);
    expect(cipher.decrypt(stored)).toBe(result.secret);
  });

  it('refuses to start again while the app is on', async () => {
    const { service } = await setup();
    await expect(service.startAppSetup(7, password)).rejects.toThrow(
      ConflictException,
    );
  });

  it('enables the app and returns a recovery code when it is the first method', async () => {
    const { service, repo, activity, mailer } = await setup(
      state({ appEnabledAt: null }),
    );
    const { recoveryCode } = await service.confirmAppSetup(7, currentCode());
    expect(recoveryCode).toMatch(/^\d{5}$/);
    const [tx, id, step, hash] = repo.enableApp.mock.calls[0] as [
      unknown,
      number,
      number,
      string,
    ];
    expect(tx).toBe(manager);
    expect(id).toBe(7);
    expect(Math.abs(step - totpStep(Date.now()))).toBeLessThanOrEqual(1);
    await expect(verifyPassword(String(recoveryCode), hash)).resolves.toBe(
      true,
    );
    expect(activity.record).toHaveBeenCalledWith(
      7,
      expect.objectContaining({
        action: ActivityAction.MfaEnabled,
        details: { method: MfaMethod.App },
      }),
    );
    expect(mailer.notify).toHaveBeenCalledWith(
      7,
      'ana@example.ro',
      MfaEvent.AppEnabled,
    );
  });

  it('keeps the existing recovery code when email is already on', async () => {
    const { service, repo } = await setup(
      state({ appEnabledAt: null, emailEnabledAt: new Date() }),
    );
    await expect(service.confirmAppSetup(7, currentCode())).resolves.toEqual({
      recoveryCode: null,
    });
    expect(repo.enableApp.mock.calls[0][3]).toBeNull();
  });

  it('does not enable the app with a wrong code or a recovery-length code', async () => {
    const { service, repo } = await setup(state({ appEnabledAt: null }));
    await expect(service.confirmAppSetup(7, '000000')).rejects.toThrow(
      new BadRequestException(MFA_WRONG_CODE),
    );
    await expect(service.confirmAppSetup(7, '12345')).rejects.toThrow(
      BadRequestException,
    );
    expect(repo.enableApp).not.toHaveBeenCalled();
  });

  it('needs a started setup before confirming', async () => {
    const { service } = await setup(off());
    await expect(service.confirmAppSetup(7, currentCode())).rejects.toThrow(
      BadRequestException,
    );
  });
});

describe('MfaService email setup', () => {
  it('emails a 6-digit code after the password and stores only its hash', async () => {
    const { service, repo, mailer } = await setup(off());
    const before = Date.now();
    await expect(service.startEmailSetup(7, password)).resolves.toEqual({
      sentTo: 'a***@example.ro',
    });
    const [, code] = repo.saveEmailCode.mock.calls[0] as [number, MfaEmailCode];
    const [, to, sent] = mailer.sendCode.mock.calls[0] as [
      number,
      string,
      string,
    ];
    expect(to).toBe('ana@example.ro');
    expect(sent).toMatch(/^\d{6}$/);
    expect(code.hash).not.toContain(sent);
    await expect(verifyPassword(sent, code.hash)).resolves.toBe(true);
    expect(code.expiresAt.getTime()).toBeGreaterThanOrEqual(
      before + MFA_EMAIL_CODE_TTL_MS,
    );
    expect(code.resendBefore.getTime()).toBeLessThanOrEqual(
      code.sentAt.getTime() - MFA_EMAIL_RESEND_MS,
    );
  });

  it('refuses a wrong password and a second email within a minute', async () => {
    const { service, repo, mailer } = await setup(off());
    await expect(service.startEmailSetup(7, 'wrong-password')).rejects.toThrow(
      BadRequestException,
    );
    repo.saveEmailCode.mockResolvedValue(false);
    await expect(service.startEmailSetup(7, password)).rejects.toThrow(
      new HttpException(MFA_EMAIL_WAIT, 429),
    );
    expect(mailer.sendCode).not.toHaveBeenCalled();
  });

  it('drops the code and answers 503 when the email cannot be sent', async () => {
    const { service, repo, mailer } = await setup(off());
    mailer.sendCode.mockRejectedValue(new Error('SMTP down'));
    await expect(service.startEmailSetup(7, password)).rejects.toThrow(
      ServiceUnavailableException,
    );
    const [, code] = repo.saveEmailCode.mock.calls[0] as [number, MfaEmailCode];
    expect(repo.clearEmailCode).toHaveBeenCalledWith(7, code.hash);
  });

  it('enables email with the emailed code and gives the first recovery code', async () => {
    const hash = await hashPassword('424242');
    const { service, repo, mailer } = await setup(
      off({ emailCodeHash: hash, emailCodeExpiresAt: soon() }),
    );
    const { recoveryCode } = await service.confirmEmailSetup(7, '424242');
    expect(recoveryCode).toMatch(/^\d{5}$/);
    expect(repo.enableEmail).toHaveBeenCalledWith(
      manager,
      7,
      hash,
      expect.stringMatching(/^scrypt\$/),
      expect.any(Date),
    );
    expect(mailer.notify).toHaveBeenCalledWith(
      7,
      'ana@example.ro',
      MfaEvent.EmailEnabled,
    );
  });

  it('keeps the recovery code when the app is already on', async () => {
    const hash = await hashPassword('424242');
    const { service } = await setup(
      state({ emailCodeHash: hash, emailCodeExpiresAt: soon() }),
    );
    await expect(service.confirmEmailSetup(7, '424242')).resolves.toEqual({
      recoveryCode: null,
    });
  });

  it('refuses a wrong or expired emailed code', async () => {
    const hash = await hashPassword('424242');
    const wrong = await setup(
      off({ emailCodeHash: hash, emailCodeExpiresAt: soon() }),
    );
    await expect(wrong.service.confirmEmailSetup(7, '111111')).rejects.toThrow(
      new BadRequestException(MFA_WRONG_CODE),
    );
    const expired = await setup(
      off({
        emailCodeHash: hash,
        emailCodeExpiresAt: new Date(Date.now() - 1000),
      }),
    );
    await expect(
      expired.service.confirmEmailSetup(7, '424242'),
    ).rejects.toThrow(BadRequestException);
    expect(wrong.repo.enableEmail).not.toHaveBeenCalled();
    expect(expired.repo.enableEmail).not.toHaveBeenCalled();
  });
});

describe('MfaService.verifyLogin with the app', () => {
  it('accepts a current TOTP code and records its step', async () => {
    const { service, repo } = await setup();
    await expect(service.verifyLogin(7, currentCode())).resolves.toEqual({
      method: MfaMethod.App,
    });
    expect(repo.recordTotpSuccess).toHaveBeenCalledWith(7, expect.any(Number));
  });

  it('treats a code whose step another request just used as wrong', async () => {
    const { service, repo } = await setup();
    repo.recordTotpSuccess.mockResolvedValue(false);
    await expect(service.verifyLogin(7, currentCode())).rejects.toThrow(
      new UnauthorizedException(MFA_WRONG_CODE),
    );
    expect(repo.claimAttempt).toHaveBeenCalledTimes(1);
  });

  it('counts a wrong code towards the lock', async () => {
    const { service, repo } = await setup();
    const before = Date.now();
    await expect(service.verifyLogin(7, '000000')).rejects.toThrow(
      UnauthorizedException,
    );
    const [id, limits] = repo.claimAttempt.mock.calls[0] as [
      number,
      { recovery: boolean; maxAttempts: number; lockedUntil: Date },
    ];
    expect(id).toBe(7);
    expect(limits).toMatchObject({
      recovery: false,
      maxAttempts: MFA_MAX_FAILED_ATTEMPTS,
    });
    expect(limits.lockedUntil.getTime()).toBeGreaterThanOrEqual(
      before + MFA_LOCK_MS,
    );
  });

  it('claims the attempt before checking the code, so parallel guesses cannot pass the lock', async () => {
    const { service, repo } = await setup();
    repo.claimAttempt.mockResolvedValue(false);
    repo.findState
      .mockResolvedValueOnce(state())
      .mockResolvedValueOnce(
        state({ lockedUntil: new Date(Date.now() + MFA_LOCK_MS) }),
      );
    await expect(service.verifyLogin(7, currentCode())).rejects.toThrow(
      new ForbiddenException(MFA_LOCKED),
    );
    expect(repo.recordTotpSuccess).not.toHaveBeenCalled();
  });

  it('refuses every code while locked, even the right one', async () => {
    const { service, repo } = await setup(
      state({ lockedUntil: new Date(Date.now() + 60_000) }),
    );
    await expect(service.verifyLogin(7, currentCode())).rejects.toThrow(
      new ForbiddenException(MFA_LOCKED),
    );
    expect(repo.claimAttempt).not.toHaveBeenCalled();
  });

  it('works again once the lock has expired', async () => {
    const { service } = await setup(
      state({ lockedUntil: new Date(Date.now() - 1000) }),
    );
    await expect(service.verifyLogin(7, currentCode())).resolves.toEqual({
      method: MfaMethod.App,
    });
  });

  it('answers 401 when MFA was turned off meanwhile', async () => {
    const { service } = await setup(off());
    await expect(service.verifyLogin(7, currentCode())).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('answers 400 for the app when only email is on', async () => {
    const { service, repo } = await setup(off({ emailEnabledAt: new Date() }));
    await expect(
      service.verifyLogin(7, currentCode(), MfaMethod.App),
    ).rejects.toThrow(new BadRequestException(MFA_METHOD_OFF));
    expect(repo.claimAttempt).not.toHaveBeenCalled();
  });
});

describe('MfaService.verifyLogin with an emailed code', () => {
  it('sends a login code only when email is on', async () => {
    const onlyApp = await setup();
    await expect(onlyApp.service.sendLoginEmailCode(7)).rejects.toThrow(
      new BadRequestException(MFA_METHOD_OFF),
    );
    const withEmail = await setup(state({ emailEnabledAt: new Date() }));
    await expect(withEmail.service.sendLoginEmailCode(7)).resolves.toEqual({
      sentTo: 'a***@example.ro',
    });
    expect(withEmail.mailer.sendCode).toHaveBeenCalled();
  });

  it('does not send a code while verification is locked', async () => {
    const { service, mailer } = await setup(
      state({
        emailEnabledAt: new Date(),
        lockedUntil: new Date(Date.now() + 60_000),
      }),
    );
    await expect(service.sendLoginEmailCode(7)).rejects.toThrow(
      ForbiddenException,
    );
    expect(mailer.sendCode).not.toHaveBeenCalled();
  });

  it('accepts the emailed code once', async () => {
    const hash = await hashPassword('424242');
    const { service, repo } = await setup(
      off({
        emailEnabledAt: new Date(),
        emailCodeHash: hash,
        emailCodeExpiresAt: soon(),
      }),
    );
    await expect(
      service.verifyLogin(7, '424242', MfaMethod.Email),
    ).resolves.toEqual({ method: MfaMethod.Email });
    expect(repo.consumeEmailCode).toHaveBeenCalledWith(
      7,
      hash,
      expect.any(Date),
    );
    repo.consumeEmailCode.mockResolvedValue(false);
    await expect(
      service.verifyLogin(7, '424242', MfaMethod.Email),
    ).rejects.toThrow(new UnauthorizedException(MFA_WRONG_CODE));
  });

  it('counts a wrong, missing or expired emailed code as a failed attempt', async () => {
    const hash = await hashPassword('424242');
    const cases: [Partial<MfaState>, string][] = [
      [{ emailCodeHash: hash, emailCodeExpiresAt: soon() }, '111111'],
      [{ emailCodeHash: null, emailCodeExpiresAt: null }, '424242'],
      [
        {
          emailCodeHash: hash,
          emailCodeExpiresAt: new Date(Date.now() - 1000),
        },
        '424242',
      ],
    ];
    for (const [overrides, code] of cases) {
      const { service, repo } = await setup(
        off({ emailEnabledAt: new Date(), ...overrides }),
      );
      await expect(
        service.verifyLogin(7, code, MfaMethod.Email),
      ).rejects.toThrow(new UnauthorizedException(MFA_WRONG_CODE));
      expect(repo.claimAttempt).toHaveBeenCalledWith(
        7,
        expect.objectContaining({ recovery: false }),
      );
      expect(repo.consumeEmailCode).not.toHaveBeenCalled();
    }
  });
});

describe('MfaService.verifyLogin with the recovery code', () => {
  it('accepts it once and reports it', async () => {
    const hash = await hashPassword('04821');
    const { service, repo, activity, mailer } = await setup(
      state({ recoveryHash: hash }),
    );
    await expect(service.verifyLogin(7, '04821')).resolves.toEqual({
      method: MfaMethod.Recovery,
    });
    expect(repo.consumeRecoveryCode).toHaveBeenCalledWith(manager, 7, hash);
    expect(activity.record).toHaveBeenCalledWith(
      7,
      expect.objectContaining({ action: ActivityAction.MfaRecoveryUsed }),
    );
    expect(mailer.notify).toHaveBeenCalledWith(
      7,
      'ana@example.ro',
      MfaEvent.RecoveryUsed,
    );
  });

  it('works when only email is on', async () => {
    const { service } = await setup(
      off({
        emailEnabledAt: new Date(),
        recoveryHash: await hashPassword('04821'),
      }),
    );
    await expect(service.verifyLogin(7, '04821')).resolves.toEqual({
      method: MfaMethod.Recovery,
    });
  });

  it('rejects it when a parallel login consumed it first', async () => {
    const { service, repo, mailer } = await setup(
      state({ recoveryHash: await hashPassword('04821') }),
    );
    repo.consumeRecoveryCode.mockResolvedValue(false);
    await expect(service.verifyLogin(7, '04821')).rejects.toThrow(
      UnauthorizedException,
    );
    expect(mailer.notify).not.toHaveBeenCalled();
  });

  it('counts a wrong or spent recovery code as a recovery failure', async () => {
    for (const hash of [await hashPassword('04821'), null]) {
      const { service, repo } = await setup(state({ recoveryHash: hash }));
      await expect(service.verifyLogin(7, '11111')).rejects.toThrow(
        new UnauthorizedException(MFA_WRONG_CODE),
      );
      expect(repo.claimAttempt).toHaveBeenCalledWith(
        7,
        expect.objectContaining({
          recovery: true,
          maxRecoveryFailures: MFA_RECOVERY_MAX_FAILURES,
        }),
      );
      expect(repo.consumeRecoveryCode).not.toHaveBeenCalled();
    }
  });

  it('blocks it after 10 wrong tries but still takes TOTP', async () => {
    const { service, repo } = await setup(
      state({
        recoveryHash: await hashPassword('04821'),
        recoveryFailures: 10,
      }),
    );
    await expect(service.verifyLogin(7, '04821')).rejects.toThrow(
      new ForbiddenException(MFA_RECOVERY_BLOCKED),
    );
    expect(repo.claimAttempt).not.toHaveBeenCalled();
    await expect(service.verifyLogin(7, currentCode())).resolves.toEqual({
      method: MfaMethod.App,
    });
  });

  it('reports the blocked code when another request used the last try', async () => {
    const { service, repo } = await setup(
      state({ recoveryHash: await hashPassword('04821') }),
    );
    repo.claimAttempt.mockResolvedValue(false);
    repo.findState
      .mockResolvedValueOnce(state({ recoveryHash: 'h' }))
      .mockResolvedValueOnce(state({ recoveryFailures: 10 }));
    await expect(service.verifyLogin(7, '04821')).rejects.toThrow(
      new ForbiddenException(MFA_RECOVERY_BLOCKED),
    );
    expect(repo.consumeRecoveryCode).not.toHaveBeenCalled();
  });
});

describe('MfaService recovery code and disable', () => {
  it('replaces the recovery code after checking the password', async () => {
    const { service, repo, mailer } = await setup();
    await expect(
      service.regenerateRecoveryCode(7, 'wrong-password'),
    ).rejects.toThrow(BadRequestException);
    const { recoveryCode } = await service.regenerateRecoveryCode(7, password);
    expect(recoveryCode).toMatch(/^\d{5}$/);
    const [, , hash] = repo.replaceRecoveryCode.mock.calls[0] as [
      unknown,
      number,
      string,
    ];
    await expect(verifyPassword(recoveryCode, hash)).resolves.toBe(true);
    expect(mailer.notify).toHaveBeenCalledWith(
      7,
      'ana@example.ro',
      MfaEvent.RecoveryRegenerated,
    );
  });

  it('answers 400 when there is no MFA to regenerate for', async () => {
    const { service, repo } = await setup();
    repo.replaceRecoveryCode.mockResolvedValue(false);
    await expect(service.regenerateRecoveryCode(7, password)).rejects.toThrow(
      BadRequestException,
    );
  });

  it.each([
    [MfaMethod.App, 'disableApp', MfaEvent.AppDisabled],
    [MfaMethod.Email, 'disableEmail', MfaEvent.EmailDisabled],
    [null, 'disableAll', MfaEvent.Disabled],
  ] as const)(
    'turns off %s with the password and tells the accountant',
    async (method, repoMethod, event) => {
      const { service, repo, activity, mailer } = await setup();
      await expect(
        service.disable(7, 'wrong-password', method),
      ).rejects.toThrow(BadRequestException);
      expect(repo[repoMethod]).not.toHaveBeenCalled();
      await service.disable(7, password, method);
      expect(repo[repoMethod]).toHaveBeenCalledWith(manager, 7);
      expect(activity.record).toHaveBeenCalledWith(
        7,
        expect.objectContaining({
          action: ActivityAction.MfaDisabled,
          details: { method },
        }),
      );
      expect(mailer.notify).toHaveBeenCalledWith(7, 'ana@example.ro', event);
    },
  );

  it('answers 400 when the method is already off', async () => {
    const { service, repo } = await setup();
    repo.disableEmail.mockResolvedValue(false);
    await expect(service.disable(7, password, MfaMethod.Email)).rejects.toThrow(
      new BadRequestException(MFA_METHOD_OFF),
    );
  });
});

describe('MfaService.trustsDevice', () => {
  const changedAt = new Date('2026-10-01T10:00:00.700Z');
  const seconds = Math.floor(changedAt.getTime() / 1000);
  const accountant = {
    id: 7,
    mfaChangedAt: changedAt,
    passwordChangedAt: null,
  };

  it('trusts a cookie issued for this accountant after the last MFA change', async () => {
    const { service } = await setup();
    expect(
      service.trustsDevice(accountant, { accountantId: 7, issuedAt: seconds }),
    ).toBe(true);
  });

  it('does not trust a missing cookie, another accountant or an older cookie', async () => {
    const { service } = await setup();
    expect(service.trustsDevice(accountant, null)).toBe(false);
    expect(
      service.trustsDevice(accountant, { accountantId: 8, issuedAt: seconds }),
    ).toBe(false);
    expect(
      service.trustsDevice(accountant, {
        accountantId: 7,
        issuedAt: seconds - 1,
      }),
    ).toBe(false);
    expect(
      service.trustsDevice(accountant, {
        accountantId: 7,
        issuedAt: undefined,
      }),
    ).toBe(false);
  });

  it('does not trust a cookie older than the last password change', async () => {
    const { service } = await setup();
    expect(
      service.trustsDevice(
        {
          ...accountant,
          passwordChangedAt: new Date(changedAt.getTime() + 5000),
        },
        { accountantId: 7, issuedAt: seconds + 1 },
      ),
    ).toBe(false);
  });
});

describe('MfaService and the accountants table', () => {
  it('bumps mfa_changed_at in the same transaction as the MFA change', async () => {
    const { service, repo, accountants } = await setup(
      state({ appEnabledAt: null }),
    );
    await service.confirmAppSetup(7, currentCode());
    expect(repo.enableApp.mock.calls[0][0]).toBe(manager);
    expect(accountants.markMfaChanged).toHaveBeenCalledWith(
      manager,
      7,
      expect.any(Date),
    );
  });

  it('leaves mfa_changed_at alone when nothing changed', async () => {
    const { service, repo, accountants } = await setup();
    repo.disableEmail.mockResolvedValue(false);
    await expect(service.disable(7, password, MfaMethod.Email)).rejects.toThrow(
      BadRequestException,
    );
    expect(accountants.markMfaChanged).not.toHaveBeenCalled();
  });

  it('treats an accountant without an MFA row as having MFA off', async () => {
    const { service } = await setup(null);
    await expect(service.status(7)).resolves.toEqual({
      enabled: false,
      appEnabledAt: null,
      emailEnabledAt: null,
      recoveryCodeAvailable: false,
    });
    await expect(service.startAppSetup(7, password)).resolves.toMatchObject({
      otpauthUri: expect.stringContaining('ana%40example.ro'),
    });
    await expect(service.verifyLogin(7, '123456')).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('answers 401 at login when the account is gone', async () => {
    const { service, accountants } = await setup();
    accountants.findById.mockResolvedValue(null);
    await expect(service.verifyLogin(7, currentCode())).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('reads the methods for the login answer', async () => {
    const { service, repo } = await setup();
    Object.assign(repo, {
      findFactors: vi
        .fn()
        .mockResolvedValue({ appEnabledAt: new Date(), emailEnabledAt: null }),
    });
    await expect(service.factors(7)).resolves.toEqual([MfaMethod.App]);
  });
});
