import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { AccountantsService } from '../../accountants/services/accountants.service.js';
import { hashPassword } from '../../common/crypto/password.js';
import { ACCOUNT_PENDING, AuthService } from './auth.service.js';
import { SESSION_AUDIENCE } from '../session.js';

const jwt = new JwtService({ secret: 'x'.repeat(32) });
const password = 'a-long-password';

async function setup(found: Record<string, unknown> | null) {
  const accountants = {
    findByEmailWithPassword: vi
      .fn()
      .mockResolvedValue(
        found && { ...found, passwordHash: await hashPassword(password) },
      ),
  } as unknown as AccountantsService;
  return new AuthService(accountants, jwt);
}

describe('AuthService', () => {
  it('logs in an active accountant', async () => {
    const service = await setup({ id: 1, status: 'active' });
    await expect(
      service.validateLogin({ email: 'a@example.com', password }),
    ).resolves.toMatchObject({ id: 1 });
  });

  it('refuses a pending accountant with 403 after checking the password', async () => {
    const service = await setup({ id: 1, status: 'pending' });
    await expect(
      service.validateLogin({ email: 'a@example.com', password }),
    ).rejects.toThrow(new ForbiddenException(ACCOUNT_PENDING));
  });

  it('does not reveal a pending account to a wrong password', async () => {
    const service = await setup({ id: 1, status: 'pending' });
    await expect(
      service.validateLogin({
        email: 'a@example.com',
        password: 'wrong-pass!',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects an unknown email with 401', async () => {
    const service = await setup(null);
    await expect(
      service.validateLogin({ email: 'a@example.com', password }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('signs sessions with the session audience', async () => {
    const token = await (await setup(null)).signSession(1);
    await expect(
      jwt.verifyAsync(token, { audience: SESSION_AUDIENCE }),
    ).resolves.toMatchObject({ sub: '1', aud: SESSION_AUDIENCE });
  });
});

describe('AuthService.validateLogin timing', () => {
  it('still runs a password check for an unknown email', async () => {
    const crypto = await import('../../common/crypto/password.js');
    const verify = vi.spyOn(crypto, 'verifyPassword');
    const service = await setup(null);
    await expect(
      service.validateLogin({ email: 'nobody@example.com', password }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(verify).toHaveBeenCalledWith(
      password,
      expect.stringMatching(/^scrypt\$/),
    );
    verify.mockRestore();
  });
});

describe('AuthService.isSessionValid', () => {
  function withState(state: Record<string, unknown> | null) {
    const accountants = {
      findSessionState: vi.fn().mockResolvedValue(state),
    } as unknown as AccountantsService;
    return new AuthService(accountants, jwt);
  }

  const changedAt = new Date('2026-10-01T10:00:00.700Z');
  const changedAtSeconds = Math.floor(changedAt.getTime() / 1000);

  it('accepts an active accountant who never changed the password', async () => {
    await expect(
      withState({ status: 'active', passwordChangedAt: null }).isSessionValid(
        1,
        123,
      ),
    ).resolves.toBe(true);
  });

  it('rejects a deleted accountant', async () => {
    await expect(withState(null).isSessionValid(1, 123)).resolves.toBe(false);
  });

  it('rejects a pending accountant', async () => {
    await expect(
      withState({ status: 'pending', passwordChangedAt: null }).isSessionValid(
        1,
        123,
      ),
    ).resolves.toBe(false);
  });

  it('rejects a session issued before the last password change', async () => {
    const service = withState({
      status: 'active',
      passwordChangedAt: changedAt,
    });
    await expect(
      service.isSessionValid(1, changedAtSeconds - 1),
    ).resolves.toBe(false);
    await expect(service.isSessionValid(1, undefined)).resolves.toBe(false);
  });

  it('accepts a session issued in the same second as the change', async () => {
    const service = withState({
      status: 'active',
      passwordChangedAt: changedAt,
    });
    await expect(service.isSessionValid(1, changedAtSeconds)).resolves.toBe(
      true,
    );
  });
});
