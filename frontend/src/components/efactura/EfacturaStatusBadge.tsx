import { StatusBadge } from '../ui';
import { UploadStatus } from '../../api/enums';

export function EfacturaStatusBadge({ status }: { status: UploadStatus }) {
  if (status === UploadStatus.Rejected) {
    return <StatusBadge status="nok">Refuzat de ANAF</StatusBadge>;
  }
  return <StatusBadge status={status} />;
}
