import { Navigate, useSearchParams } from 'react-router';
import type { AuthTab } from './AuthPanel';

export function AuthRedirect({ tab }: { tab: AuthTab }) {
  const [params] = useSearchParams();
  const q = new URLSearchParams({ auth: tab });
  const next = params.get('next');
  if (next) q.set('next', next);
  return <Navigate to={`/?${q.toString()}`} replace />;
}
