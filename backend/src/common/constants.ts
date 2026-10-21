import { CronExpression } from '@nestjs/schedule';

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
export const EFACTURA_IMPORT_THROTTLE = {
  default: { limit: 10, ttl: MINUTE_MS },
};
export const INVOICE_THROTTLE = { default: { limit: 30, ttl: MINUTE_MS } };
export const INVOICE_MAIL_THROTTLE = { default: { limit: 10, ttl: MINUTE_MS } };
export const PUBLIC_LINK_THROTTLE = { default: { limit: 20, ttl: MINUTE_MS } };
export const EXPORT_THROTTLE = { default: { limit: 5, ttl: MINUTE_MS } };
export const PUBLIC_STATS_THROTTLE = { default: { limit: 30, ttl: MINUTE_MS } };

export const ANAF_REFRESH_TOKEN_LIFETIME_MS = 365 * 24 * 3600 * 1000;

export const CRON_TIME_ZONE = 'Europe/Bucharest';
export const CRON_OPTIONS = { timeZone: CRON_TIME_ZONE };
export const ADMIN_APPROVAL_RETRY_SCHEDULE = CronExpression.EVERY_DAY_AT_8AM;
export const PURGE_SCHEDULE = '0 3 1 * *';
export const SPV_SYNC_SCHEDULE = '0 3 * * 1,3,5'; // 03:00 Europe/Bucharest on Mon, Wed, Fri
export const EFACTURA_ARCHIVE_SYNC_SCHEDULE = '0 7 * * 1,3,5'; // 07:00 Europe/Bucharest on Mon, Wed, Fri
export const PURGE_LOCK_KEY = 7_400_001;
export const EFACTURA_ARCHIVE_SYNC_LOCK_KEY = 7_400_002;
