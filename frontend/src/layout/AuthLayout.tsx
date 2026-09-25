import { Navigate, Outlet, useSearchParams } from 'react-router';
import { useMe } from '../api/hooks';
import { Wordmark } from '../components/ui';
import { useTheme } from '../hooks/useTheme';
import { safeNext } from '../lib/safeNext';

/** Centered card for login and register; signed-in users go straight to the app. */
export function AuthLayout() {
  useTheme();
  const me = useMe();
  const [params] = useSearchParams();
  if (me.data) return <Navigate to={safeNext(params.get('next'))} replace />;
  return (
    <div className="auth">
      <Wordmark />
      <Outlet />
    </div>
  );
}
