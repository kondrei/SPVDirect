import type { CookieOptions } from 'express';

export const SESSION_COOKIE = 'spv_session';
export const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;
export const SESSION_AUDIENCE = 'spv-session';

export interface SessionPayload {
  sub: string;
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
