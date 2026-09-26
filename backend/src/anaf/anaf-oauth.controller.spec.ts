import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { Request, Response } from 'express';
import type { CompaniesService } from '../companies/companies.service.js';
import { AnafOAuthController } from './anaf-oauth.controller.js';
import type { AnafOAuthService } from './anaf-oauth.service.js';
import type { AuthorizationLinksService } from './authorization-links/authorization-links.service.js';
import { OAUTH_STATE_AUDIENCE, OAUTH_STATE_COOKIE } from './oauth-state.js';

const jwt = new JwtService({ secret: 'x'.repeat(32) });

async function callback({
  accountantId = 5,
  error,
}: { accountantId?: unknown; error?: string } = {}) {
  const oauth = {
    exchangeCode: vi.fn().mockResolvedValue({}),
    saveConnection: vi.fn().mockResolvedValue({ id: 'conn-1' }),
  };
  const controller = new AnafOAuthController(
    oauth as unknown as AnafOAuthService,
    {} as AuthorizationLinksService,
    {} as CompaniesService,
    jwt,
    new ConfigService({ FRONTEND_URL: 'http://localhost:5173' }),
  );
  const state = await jwt.signAsync(
    { state: 's', mode: 'self', accountantId },
    { audience: OAUTH_STATE_AUDIENCE },
  );
  const req = {
    cookies: { [OAUTH_STATE_COOKIE]: state },
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
    's',
    error,
    req,
    res as unknown as Response,
  );
  return { oauth, res };
}

describe('AnafOAuthController.callback (self)', () => {
  it('saves the connection and returns to the accountant’s connections page', async () => {
    const { oauth, res } = await callback();
    expect(oauth.saveConnection).toHaveBeenCalledWith(5, {}, 'self');
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
});

describe('AnafOAuthController.callback with a state cookie from before integer ids', () => {
  it('treats it as expired instead of saving the connection', async () => {
    const { oauth, res } = await callback({
      accountantId: '0f8fad5b-d9cb-469f-a165-70867728950e',
    });
    expect(oauth.exchangeCode).not.toHaveBeenCalled();
    expect(oauth.saveConnection).not.toHaveBeenCalled();
    expect(res.redirect).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.send.mock.calls[0][0]).toContain('Sesiune expirată');
  });
});
