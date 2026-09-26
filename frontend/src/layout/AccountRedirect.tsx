import { Navigate, useLocation } from 'react-router';
import { useMe } from '../api/hooks';
import { accountantPath } from '../hooks/useAppPath';

export function AccountRedirect() {
  const me = useMe();
  const location = useLocation();
  if (me.isPending) return <div className="loading">Se încarcă…</div>;
  if (!me.data) {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?next=${next}`} replace />;
  }
  const rest = location.pathname === '/' ? '' : location.pathname;
  return (
    <Navigate
      to={accountantPath(me.data.id, rest) + location.search}
      replace
    />
  );
}
