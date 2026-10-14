import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { Request, Response } from 'express';
import { AnafOAuthController } from './anaf-oauth.controller.js';
import type { AuthorizationLinksService } from '../authorization-links/authorization-links.service.js';
import type {
  AnafAuthorizationService,
  AuthorizationOutcome,
} from '../services/anaf-authorization.service.js';
import { OAUTH_STATE_AUDIENCE, OAUTH_STATE_COOKIE } from '../oauth-state.js';

const jwt = new JwtService({ secret: 'x'.repeat(32) });

async function callback({
  accountantId = 5,
  error,
  state = 's',
  mode = 'self',
  outcome = { kind: 'self', accountantId: 5 },
}: {
  accountantId?: unknown;
  error?: string;
  state?: string;
  mode?: 'self' | 'link';
  outcome?: AuthorizationOutcome;
} = {}) {
  const authorization = {
    complete: vi.fn().mockResolvedValue(outcome),
  };
  const controller = new AnafOAuthController(
    authorization as unknown as AnafAuthorizationService,
    {} as AuthorizationLinksService,
    jwt,
    new ConfigService({ FRONTEND_URL: 'http://localhost:5173' }),
  );
  const cookie = await jwt.signAsync(
    mode === 'self'
      ? { state: 's', mode, accountantId }
      : { state: 's', mode, linkId: 'link-1' },
    { audience: OAUTH_STATE_AUDIENCE },
  );
  const req = {
    cookies: { [OAUTH_STATE_COOKIE]: cookie },
  } as unknown as Request;
  const res = {
    clearCookie: vi.fn(),
    redirect: vi.fn(),
    status: vi.fn().mockReturnThis(),
    type: vi.fn().mockReturnThis(),
    send: vi.fn().mockReturnThis(),
  };
  await controller.callback(
    error ? undefined : 'code',
    state,
    error,
    req,
    res as unknown as Response,
  );
  return { authorization, res };
}

describe('AnafOAuthController.callback (self)', () => {
  it('completes the authorization and returns to the accountant’s connections page', async () => {
    const { authorization, res } = await callback();
    expect(authorization.complete).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'self', accountantId: 5 }),
      'code',
    );
    expect(res.redirect).toHaveBeenCalledWith(
      'http://localhost:5173/accountants/5/connections?status=ok',
    );
  });

  it('reports an ANAF refusal on the accountant’s connections page', async () => {
    const { res } = await callback({ error: 'access_denied' });
    const url = res.redirect.mock.calls[0][0] as string;
    expect(url).toMatch(
      /^http:\/\/localhost:5173\/accountants\/5\/connections\?status=error&message=/,
    );
    expect(decodeURIComponent(url)).toContain('access_denied');
  });

  it('rejects a callback without the state parameter', async () => {
    const { authorization, res } = await callback({ state: '' });
    expect(authorization.complete).not.toHaveBeenCalled();
    expect(
      decodeURIComponent(res.redirect.mock.calls[0][0] as string),
    ).toContain('Parametrul state nu corespunde');
  });

  it('rejects a callback whose state does not match the cookie', async () => {
    const { authorization } = await callback({ state: 'other' });
    expect(authorization.complete).not.toHaveBeenCalled();
  });
});

describe('AnafOAuthController.callback (link)', () => {
  it('answers 409 when the link was already used', async () => {
    const { res } = await callback({
      mode: 'link',
      outcome: { kind: 'link-invalid', reason: 'used' },
    });
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.send.mock.calls[0][0]).toContain('deja folosit');
  });

  it('shows the company name, escaped, on success', async () => {
    const { res } = await callback({
      mode: 'link',
      outcome: { kind: 'link', companyName: '<b>Firma</b>' },
    });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.send.mock.calls[0][0]).toContain('&lt;b&gt;Firma&lt;/b&gt;');
  });
});

describe('AnafOAuthController.callback with a state cookie from before integer ids', () => {
  it('treats it as expired instead of saving the connection', async () => {
    const { authorization, res } = await callback({
      accountantId: '0f8fad5b-d9cb-469f-a165-70867728950e',
    });
    expect(authorization.complete).not.toHaveBeenCalled();
    expect(res.redirect).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.send.mock.calls[0][0]).toContain('Sesiune expirată');
  });
});
