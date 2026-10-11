import type { EfacturaStatus } from '../../api/types';
import { StatusBadge } from '../ui';

export function EfacturaStatusBadge({ status }: { status: EfacturaStatus }) {
  if (status === 'rejected') {
    return <StatusBadge status="nok">Refuzat de ANAF</StatusBadge>;
  }
  return <StatusBadge status={status} />;
}
