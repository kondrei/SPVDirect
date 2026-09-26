import { useParams } from 'react-router';

export function accountantPath(accountantId: number | string, path = '') {
  return `/accountants/${encodeURIComponent(String(accountantId))}${path}`;
}

export function useAppPath() {
  const { accountantId = '' } = useParams();
  return (path = '') => accountantPath(accountantId, path);
}
