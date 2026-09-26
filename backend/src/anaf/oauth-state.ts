export const OAUTH_STATE_COOKIE = 'spv_anaf_oauth';
export const OAUTH_STATE_TTL_SECONDS = 10 * 60;
export const OAUTH_STATE_AUDIENCE = 'spv-anaf-oauth';

export type OAuthStatePayload =
  | { state: string; mode: 'self'; accountantId: number }
  | { state: string; mode: 'link'; linkId: string };
