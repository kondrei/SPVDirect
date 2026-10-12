import type { ExecutionContext } from '@nestjs/common';
import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { OAUTH_STATE_AUDIENCE } from '../../anaf/oauth-state.js';
import type { AuthService } from '../services/auth.service.js';
import { AuthenticatedRequest, JwtAuthGuard } from './jwt-auth.guard.js';
import { SESSION_AUDIENCE, SESSION_COOKIE } from '../session.js';

const jwt = new JwtService({ secret: 'x'.repeat(32) });

function setup(valid = true) {
  const auth = { isSessionValid: vi.fn().mockResolvedValue(valid) };
  return { auth, guard: new JwtAuthGuard(jwt, auth as unknown as AuthService) };
}

function contextWithCookie(token?: string) {
  const req = {
    cookies: token ? { [SESSION_COOKIE]: token } : {},
  } as unknown as AuthenticatedRequest;
  const context = {
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
  return { req, context };
}

describe('JwtAuthGuard', () => {
  it('accepts a session token and exposes the accountant id', async () => {
    const { guard, auth } = setup();
    const token = await jwt.signAsync(
      { sub: '1' },
      { audience: SESSION_AUDIENCE },
    );
    const { req, context } = contextWithCookie(token);
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(req.accountantId).toBe(1);
    expect(auth.isSessionValid).toHaveBeenCalledWith(1, expect.any(Number));
  });

  it('rejects a valid token whose accountant is no longer active', async () => {
    const { guard } = setup(false);
    const token = await jwt.signAsync(
      { sub: '1' },
      { audience: SESSION_AUDIENCE },
    );
    const { req, context } = contextWithCookie(token);
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(req.accountantId).toBeUndefined();
  });

  it('rejects a request without the session cookie', async () => {
    const { guard, auth } = setup();
    await expect(
      guard.canActivate(contextWithCookie().context),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(auth.isSessionValid).not.toHaveBeenCalled();
  });

  it('rejects a tampered token without touching the database', async () => {
    const { guard, auth } = setup();
    const token = await new JwtService({ secret: 'y'.repeat(32) }).signAsync(
      { sub: '1' },
      { audience: SESSION_AUDIENCE },
    );
    await expect(
      guard.canActivate(contextWithCookie(token).context),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(auth.isSessionValid).not.toHaveBeenCalled();
  });

  it('rejects an OAuth state token signed with the same secret', async () => {
    const { guard } = setup();
    const stateToken = await jwt.signAsync(
      { state: 's', mode: 'self', accountantId: 1 },
      { audience: OAUTH_STATE_AUDIENCE },
    );
    await expect(
      guard.canActivate(contextWithCookie(stateToken).context),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects a session-audience token without a subject', async () => {
    const { guard } = setup();
    const token = await jwt.signAsync({}, { audience: SESSION_AUDIENCE });
    await expect(
      guard.canActivate(contextWithCookie(token).context),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it.each([
    '0f8fad5b-d9cb-469f-a165-70867728950e',
    '0',
    '01',
    '2147483648',
    'abc',
  ])(
    'rejects a session subject %j that is not an accountant id',
    async (sub) => {
      const { guard } = setup();
      const token = await jwt.signAsync(
        { sub },
        { audience: SESSION_AUDIENCE },
      );
      await expect(
        guard.canActivate(contextWithCookie(token).context),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    },
  );
});
