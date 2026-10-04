import { useState } from 'react';
import {
  NavLink,
  Navigate,
  Outlet,
  useLocation,
  useNavigate,
  useParams,
} from 'react-router';
import { useCompanies, useConnections, useLogout, useMe } from '../api/hooks';
import { EmptyState } from '../components/EmptyState';
import {
  Button,
  ButtonLink,
  Card,
  Icon,
  Wordmark,
  type IconName,
} from '../components/ui';
import { accountantPath } from '../hooks/useAppPath';
import { useTheme } from '../hooks/useTheme';
import { connectionStatus, initials } from '../lib/format';

interface NavItem {
  to: string;
  label: string;
  icon: IconName;
  count?: number;
  end?: boolean;
}

function NavGroup({
  title,
  items,
  onNavigate,
}: {
  title?: string;
  items: NavItem[];
  onNavigate: () => void;
}) {
  return (
    <>
      {title ? <div className="spv-side-group">{title}</div> : null}
      {items.map((it) => (
        <NavLink
          key={it.to}
          to={it.to}
          end={it.end}
          className="spv-nav-item"
          onClick={onNavigate}
        >
          <Icon name={it.icon} />
          {it.label}
          {it.count ? (
            <span
              className="spv-nav-count"
              aria-label={`${it.count} de verificat`}
            >
              {it.count}
            </span>
          ) : null}
        </NavLink>
      ))}
    </>
  );
}

export function AppLayout() {
  const me = useMe();
  const location = useLocation();
  const navigate = useNavigate();
  const logout = useLogout();
  const { accountantId = '' } = useParams();
  const { theme, toggle } = useTheme();
  const [navOpen, setNavOpen] = useState(false);
  const signedIn = Boolean(me.data);
  const companies = useCompanies({ enabled: signedIn });
  const connections = useConnections({ enabled: signedIn });

  if (me.isPending) return <div className="loading">Se încarcă…</div>;
  if (!me.data) {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?next=${next}`} replace />;
  }

  const withoutCert =
    companies.data?.filter((c) => !c.anafConnectionId).length ?? 0;
  const certsNeedingAction =
    connections.data?.filter((c) => connectionStatus(c) !== 'active').length ??
    0;
  const user = me.data;
  const close = () => setNavOpen(false);
  const own = accountantId === String(user.id);
  const path = (p = '') => accountantPath(user.id, p);

  return (
    <div className={navOpen ? 'app nav-open' : 'app'}>
      <header className="app-topbar">
        <Wordmark />
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setNavOpen((o) => !o)}
          aria-expanded={navOpen}
          aria-controls="app-nav"
        >
          {navOpen ? 'Închide' : 'Meniu'}
        </Button>
      </header>
      <nav id="app-nav" className="spv-side" aria-label="Navigare principală">
        <div className="spv-side-brand">
          <Wordmark />
        </div>
        <NavGroup
          onNavigate={close}
          items={[
            { to: path(), label: 'Panou', icon: 'home', end: true },
            {
              to: path('/companies'),
              label: 'Firme',
              icon: 'building',
              count: withoutCert,
            },
            {
              to: path('/connections'),
              label: 'Certificate ANAF',
              icon: 'certificate',
              count: certsNeedingAction,
            },
          ]}
        />
        <NavGroup
          title="Servicii SPV"
          onNavigate={close}
          items={[
            { to: path('/spv'), label: 'Mesaje SPV', icon: 'download' },
            { to: path('/efactura'), label: 'e-Factura', icon: 'invoice' },
            { to: path('/etransport'), label: 'e-Transport', icon: 'truck' },
          ]}
        />
        <NavGroup
          title="Cont"
          onNavigate={close}
          items={[{ to: path('/profile'), label: 'Profil', icon: 'settings' }]}
        />
        <div className="spv-side-foot">
          <span className="spv-avatar" aria-hidden="true">
            {initials(user.name, user.email)}
          </span>
          <div className="app-user">
            <div className="app-user-name">{user.name || user.email}</div>
            <div className="app-user-email">{user.email}</div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={toggle}
            aria-label={theme === 'dark' ? 'Temă luminoasă' : 'Temă întunecată'}
            title={theme === 'dark' ? 'Temă luminoasă' : 'Temă întunecată'}
          >
            <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            aria-label="Deconectare"
            title="Deconectare"
            onClick={() =>
              logout.mutate(undefined, {
                onSettled: () => navigate('/login', { replace: true }),
              })
            }
          >
            <Icon name="logout" />
          </Button>
        </div>
      </nav>
      <main className="app-main">
        {own ? (
          <Outlet />
        ) : (
          <Card>
            <EmptyState
              icon="search"
              title="Nu aveți acces la acest cont."
              actions={
                <ButtonLink to={path()}>Mergi la contul dvs.</ButtonLink>
              }
            >
              Adresa aparține altui contabil.
            </EmptyState>
          </Card>
        )}
      </main>
    </div>
  );
}
