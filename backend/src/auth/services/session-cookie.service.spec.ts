import type { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { Request, Response } from 'express';
import {
  MFA_PENDING_AUDIENCE,
  MFA_PENDING_COOKIE,
  MFA_PENDING_TTL_SECONDS,
  MFA_TRUST_AUDIENCE,
  MFA_TRUST_COOKIE,
  MFA_TRUST_TTL_SECONDS,
} from '../dto/auth.constants.js';
import type { AuthService } from './auth.service.js';
import { SessionCookieService } from './session-cookie.service.js';

const jwt = new JwtService({ secret: 'x'.repeat(32) });

function build() {
  return new SessionCookieService({} as AuthService, jwt, {
    get: () => 'production',
  } as unknown as ConfigService);
}

function captured() {
  const cookies: Record<string, { value: string; options: unknown }> = {};
  const res = {
    cookie: vi.fn((name: string, value: string, options: unknown) => {
      cookies[name] = { value, options };
    }),
    clearCookie: vi.fn(),
  };
  return { res: res as unknown as Response, cookies, raw: res };
}

const request = (cookies: Record<string, string>) =>
  ({ cookies }) as unknown as Request;

describe('SessionCookieService MFA cookies', () => {
  it('issues the pending cookie for 5 minutes and reads it back', async () => {
    const service = build();
    const { res, cookies } = captured();
    await service.issueMfaPending(res, 7);
    const { value, options } = cookies[MFA_PENDING_COOKIE];
    expect(options).toMatchObject({
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      maxAge: MFA_PENDING_TTL_SECONDS * 1000,
    });
    await expect(
      jwt.verifyAsync(value, { audience: MFA_PENDING_AUDIENCE }),
    ).resolves.toMatchObject({ sub: '7' });
    await expect(
      service.readMfaPending(request({ [MFA_PENDING_COOKIE]: value })),
    ).resolves.toMatchObject({ accountantId: 7, issuedAt: expect.any(Number) });
  });

  it('issues the trust cookie for 30 days', async () => {
    const service = build();
    const { res, cookies } = captured();
    await service.issueMfaTrust(res, 7);
    expect(cookies[MFA_TRUST_COOKIE].options).toMatchObject({
      maxAge: MFA_TRUST_TTL_SECONDS * 1000,
    });
    await expect(
      service.readMfaTrust(
        request({ [MFA_TRUST_COOKIE]: cookies[MFA_TRUST_COOKIE].value }),
      ),
    ).resolves.toMatchObject({ accountantId: 7 });
  });

  it('does not accept one cookie in place of the other or a session token', async () => {
    const service = build();
    const pending = await jwt.signAsync(
      { sub: '7' },
      { audience: MFA_PENDING_AUDIENCE },
    );
    const session = await jwt.signAsync(
      { sub: '7' },
      { audience: 'spv-session' },
    );
    await expect(
      service.readMfaTrust(request({ [MFA_TRUST_COOKIE]: pending })),
    ).resolves.toBeNull();
    await expect(
      service.readMfaPending(request({ [MFA_PENDING_COOKIE]: session })),
    ).resolves.toBeNull();
  });

  it('returns null for a missing, forged or malformed cookie', async () => {
    const service = build();
    const forged = await new JwtService({ secret: 'y'.repeat(32) }).signAsync(
      { sub: '7' },
      { audience: MFA_TRUST_AUDIENCE },
    );
    const badSubject = await jwt.signAsync(
      { sub: 'abc' },
      { audience: MFA_TRUST_AUDIENCE },
    );
    await expect(service.readMfaTrust(request({}))).resolves.toBeNull();
    await expect(
      service.readMfaTrust({} as unknown as Request),
    ).resolves.toBeNull();
    await expect(
      service.readMfaTrust(request({ [MFA_TRUST_COOKIE]: forged })),
    ).resolves.toBeNull();
    await expect(
      service.readMfaTrust(request({ [MFA_TRUST_COOKIE]: badSubject })),
    ).resolves.toBeNull();
  });

  it('clears the pending cookie on the root path', () => {
    const { res, raw } = captured();
    build().clearMfaPending(res);
    expect(raw.clearCookie).toHaveBeenCalledWith(MFA_PENDING_COOKIE, {
      path: '/',
    });
  });
});
