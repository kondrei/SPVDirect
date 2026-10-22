import { UploadStatus } from '../../efactura/dto/efactura.enums.js';
import { ScheduledJob } from './api-log.enums.js';

export const DEFAULT_ACTIVITY_PAGE_SIZE = 20;
export const MAX_ACTIVITY_PAGE_SIZE = 100;

export const UPLOAD_STATUS_LABELS: Record<UploadStatus, string> = {
  [UploadStatus.Sending]: 'în curs de trimitere',
  [UploadStatus.Processing]: 'în prelucrare la ANAF',
  [UploadStatus.Ok]: 'validată de ANAF',
  [UploadStatus.Nok]: 'respinsă de ANAF',
  [UploadStatus.Rejected]: 'refuzată la încărcare',
};

export const MAX_JOB_ERROR_LENGTH = 500;

export const MAX_SLOW_QUERY_LENGTH = 2000;
export const SLOW_QUERY_SAVE_LIMIT = 30;
export const SLOW_QUERY_SAVE_WINDOW_MS = 60_000;
export const API_LOG_INSERT = /^\s*INSERT INTO "api_logs"/i;

export const SYSTEM_ACTOR_NAME = 'Sistem';

export const UNEXPECTED_JOB_ERROR = 'eroare neașteptată';

export const JOB_LABELS: Record<ScheduledJob, string> = {
  [ScheduledJob.Purge]: 'Ștergerea definitivă a datelor șterse',
  [ScheduledJob.AdminApprovalRetry]:
    'Retrimiterea cererilor de cont către administrator',
  [ScheduledJob.EfacturaArchiveSync]: 'Importul automat în arhiva e-Factura',
  [ScheduledJob.SpvSync]: 'Sincronizarea SPV',
};
