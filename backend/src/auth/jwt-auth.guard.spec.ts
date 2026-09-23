import type { ExecutionContext } from '@nestjs/common';
import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { OAUTH_STATE_AUDIENCE } from '../anaf/oauth-state.js';
import { AuthenticatedRequest, JwtAuthGuard } from './jwt-auth.guard.js';
import { SESSION_AUDIENCE, SESSION_COOKIE } from './session.js';

const jwt = new JwtService({ secret: 'x'.repeat(32) });
const guard = new JwtAuthGuard(jwt);

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
    const token = await jwt.signAsync(
      { sub: 'acc-1' },
      { audience: SESSION_AUDIENCE },
    );
    const { req, context } = contextWithCookie(token);

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(req.accountantId).toBe('acc-1');
  });

  it('rejects a request without the session cookie', async () => {
    await expect(
      guard.canActivate(contextWithCookie().context),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects an OAuth state token signed with the same secret', async () => {
    const stateToken = await jwt.signAsync(
      { state: 's', mode: 'self', accountantId: 'acc-1' },
      { audience: OAUTH_STATE_AUDIENCE },
    );
    await expect(
      guard.canActivate(contextWithCookie(stateToken).context),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects a session-audience token without a subject', async () => {
    const token = await jwt.signAsync({}, { audience: SESSION_AUDIENCE });
    await expect(
      guard.canActivate(contextWithCookie(token).context),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
