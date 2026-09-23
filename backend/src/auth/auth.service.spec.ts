import { ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { QueryFailedError } from 'typeorm';
import type { AccountantsService } from '../accountants/accountants.service.js';
import { AuthService } from './auth.service.js';
import { SESSION_AUDIENCE } from './session.js';

const jwt = new JwtService({ secret: 'x'.repeat(32) });

function setup(create: () => Promise<unknown>) {
  const accountants = {
    existsByEmail: vi.fn().mockResolvedValue(false),
    create: vi.fn(create),
  } as unknown as AccountantsService;
  return new AuthService(accountants, jwt);
}

const dto = { email: 'a@example.com', password: 'a-long-password' };

describe('AuthService', () => {
  it('maps a concurrent duplicate registration to 409', async () => {
    const service = setup(() =>
      Promise.reject(
        new QueryFailedError(
          'INSERT',
          [],
          Object.assign(new Error('dup'), {
            code: '23505',
          }),
        ),
      ),
    );
    await expect(service.register(dto)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('rethrows other database errors', async () => {
    const service = setup(() => Promise.reject(new Error('connection lost')));
    await expect(service.register(dto)).rejects.toThrow('connection lost');
  });

  it('signs sessions with the session audience', async () => {
    const token = await setup(() => Promise.resolve({})).signSession('acc-1');
    await expect(
      jwt.verifyAsync(token, { audience: SESSION_AUDIENCE }),
    ).resolves.toMatchObject({ sub: 'acc-1', aud: SESSION_AUDIENCE });
  });
});
