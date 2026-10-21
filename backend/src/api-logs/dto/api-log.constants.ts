import { UploadStatus } from '../../efactura/dto/efactura.enums.js';

export const DEFAULT_ACTIVITY_PAGE_SIZE = 20;
export const MAX_ACTIVITY_PAGE_SIZE = 100;

export const UPLOAD_STATUS_LABELS: Record<UploadStatus, string> = {
  [UploadStatus.Sending]: 'în curs de trimitere',
  [UploadStatus.Processing]: 'în prelucrare la ANAF',
  [UploadStatus.Ok]: 'validată de ANAF',
  [UploadStatus.Nok]: 'respinsă de ANAF',
  [UploadStatus.Rejected]: 'refuzată la încărcare',
};
