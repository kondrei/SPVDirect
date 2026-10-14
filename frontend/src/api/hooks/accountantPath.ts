import { accountantPath } from '../../hooks/useAppPath';
import { ApiError } from '../client';
import { useMe } from './auth';

export function useAccountantApiPath(path: string) {
  const accountantId = useMe().data?.id;
  return accountantId ? accountantPath(accountantId, path) : null;
}

export function requirePath(path: string | null): string {
  if (!path)
    throw new ApiError(401, 'Sesiunea a expirat. Autentificați-vă din nou.');
  return path;
}
