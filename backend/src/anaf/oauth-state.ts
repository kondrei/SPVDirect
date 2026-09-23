export const OAUTH_STATE_COOKIE = 'spv_anaf_oauth';
export const OAUTH_STATE_TTL_SECONDS = 10 * 60;
/** JWT `aud` of the state cookie, so it can't be swapped with a session token (same JWT_SECRET). */
export const OAUTH_STATE_AUDIENCE = 'spv-anaf-oauth';

/** Signed into a short-lived cookie between /anaf/connect (or a link) and /anaf/callback. */
export type OAuthStatePayload =
  | { state: string; mode: 'self'; accountantId: string }
  | { state: string; mode: 'link'; linkId: string };
