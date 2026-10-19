const MINUTE_MS = 60_000;

export const PASSWORD_THROTTLE = { default: { limit: 10, ttl: MINUTE_MS } };
export const CREDENTIALS_THROTTLE = { default: { limit: 10, ttl: MINUTE_MS } };
export const ANAF_LOOKUP_THROTTLE = { default: { limit: 20, ttl: MINUTE_MS } };
export const ANAF_CONNECTION_THROTTLE = {
  default: { limit: 10, ttl: MINUTE_MS },
};
export const ANAF_BULK_THROTTLE = { default: { limit: 5, ttl: MINUTE_MS } };
export const ARCHIVE_THROTTLE = { default: { limit: 60, ttl: MINUTE_MS } };
export const SPV_THROTTLE = { default: { limit: 30, ttl: MINUTE_MS } };
export const SPV_SYNC_THROTTLE = { default: { limit: 5, ttl: MINUTE_MS } };
export const SPV_REQUEST_THROTTLE = { default: { limit: 10, ttl: MINUTE_MS } };
export const EFACTURA_THROTTLE = { default: { limit: 30, ttl: MINUTE_MS } };
export const EFACTURA_UPLOAD_THROTTLE = {
  default: { limit: 20, ttl: MINUTE_MS },
};
export const INVOICE_THROTTLE = { default: { limit: 30, ttl: MINUTE_MS } };
export const INVOICE_MAIL_THROTTLE = { default: { limit: 10, ttl: MINUTE_MS } };
export const PUBLIC_LINK_THROTTLE = { default: { limit: 20, ttl: MINUTE_MS } };
export const PUBLIC_STATS_THROTTLE = { default: { limit: 30, ttl: MINUTE_MS } };

export const ANAF_REFRESH_TOKEN_LIFETIME_MS = 365 * 24 * 3600 * 1000;
