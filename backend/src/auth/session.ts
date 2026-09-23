import type { CookieOptions } from 'express';

export const SESSION_COOKIE = 'spv_session';
export const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;
/** JWT `aud` of session tokens. Other JWTs signed with JWT_SECRET (e.g. the OAuth state) use a different one. */
export const SESSION_AUDIENCE = 'spv-session';

export interface SessionPayload {
  sub: string; // accountant id
}

export function cookieOptions(
  maxAgeSeconds: number,
  production: boolean,
): CookieOptions {
  return {
    httpOnly: true,
    secure: production,
    // Lax still sends the cookie on the top-level redirect back from logincert.anaf.ro.
    sameSite: 'lax',
    path: '/',
    maxAge: maxAgeSeconds * 1000,
  };
}
