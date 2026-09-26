import type { CookieOptions } from 'express';

export const SESSION_COOKIE = 'spv_session';
export const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;
export const SESSION_AUDIENCE = 'spv-session';

export interface SessionPayload {
  sub: string;
}

export function parseSessionSubject(sub: unknown): number | null {
  if (typeof sub !== 'string' || !/^[1-9]\d{0,9}$/.test(sub)) return null;
  const id = Number(sub);
  return id <= 2_147_483_647 ? id : null;
}

export function cookieOptions(
  maxAgeSeconds: number,
  production: boolean,
): CookieOptions {
  return {
    httpOnly: true,
    secure: production,
    sameSite: 'lax',
    path: '/',
    maxAge: maxAgeSeconds * 1000,
  };
}
