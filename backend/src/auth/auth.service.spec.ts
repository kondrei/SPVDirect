import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { AccountantsService } from '../accountants/accountants.service.js';
import { hashPassword } from '../common/crypto/password.js';
import { ACCOUNT_PENDING, AuthService } from './auth.service.js';
import { SESSION_AUDIENCE } from './session.js';

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
