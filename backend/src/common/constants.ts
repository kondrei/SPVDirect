const MINUTE_MS = 60_000;

export const PASSWORD_THROTTLE = { default: { limit: 10, ttl: MINUTE_MS } };
export const CREDENTIALS_THROTTLE = { default: { limit: 10, ttl: MINUTE_MS } };
export const ANAF_LOOKUP_THROTTLE = { default: { limit: 20, ttl: MINUTE_MS } };
export const ANAF_BULK_THROTTLE = { default: { limit: 5, ttl: MINUTE_MS } };
export const ARCHIVE_THROTTLE = { default: { limit: 60, ttl: MINUTE_MS } };
export const SPV_THROTTLE = { default: { limit: 30, ttl: MINUTE_MS } };
export const SPV_REQUEST_THROTTLE = { default: { limit: 10, ttl: MINUTE_MS } };
