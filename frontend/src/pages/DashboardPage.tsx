import { Link } from 'react-router';
import { useCompanies } from '../api/hooks/companies';
import { useConnections, useConnectUrl } from '../api/hooks/connections';
import { useInvoiceStats } from '../api/hooks/invoices';
import { useMe } from '../api/hooks/auth';
import type { AnafConnection } from '../api/types';
import { EmptyState } from '../components/EmptyState';
import { PageHead } from '../components/PageHead';
import { QueryError } from '../components/QueryError';
import {
  Alert,
  ButtonAnchor,
  ButtonLink,
  Card,
  DataTable,
  Stat,
  StatusBadge,
} from '../components/ui';
import { useAppPath } from '../hooks/useAppPath';
import {
  connectionStatus,
  daysUntil,
  formatAmount,
  formatCui,
  formatMonth,
  groupSerial,
  pluralCertificate,
  pluralFacturi,
  pluralFirme,
  pluralStornari,
  pluralZile,
} from '../lib/format';

const todayFmt = new Intl.DateTimeFormat('ro-RO', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'Europe/Bucharest',
});

function firstName(name: string | null) {
  return name?.trim().split(/\s+/)[0];
}

export function DashboardPage() {
  const me = useMe();
  const companies = useCompanies();
  const connections = useConnections();
  const invoiceStats = useInvoiceStats();
  const appPath = useAppPath();
  const connectUrl = useConnectUrl();
  const today = todayFmt.format(new Date());

  const conns = connections.data ?? [];
  const list = companies.data ?? [];
  const withoutCert = list.filter((c) => !c.anafConnectionId);
  const active = conns.filter(
    (c) =>
      connectionStatus(c) === 'active' || connectionStatus(c) === 'expiring',
  );
  const expiring = conns
    .filter((c) => connectionStatus(c) === 'expiring')
    .sort((a, b) => a.refreshExpiresAt.localeCompare(b.refreshExpiresAt));
  const dead = conns.filter((c) =>
    ['expired', 'revoked'].includes(connectionStatus(c)),
  );
  const companiesOn = (c: AnafConnection) =>
    list.filter((co) => co.anafConnectionId === c.id).length;
  const name = firstName(me.data?.name ?? null);
  const stats = invoiceStats.data;
  const peak = stats ? Math.max(...stats.months.map((m) => m.grossRon), 0) : 0;
  const trend = stats
    ? stats.month.grossRon - stats.previousMonth.grossRon
    : 0;

  return (
    <>
      <PageHead
        title={name ? `Bună ziua, ${name}` : 'Panou'}
        context={today.charAt(0).toUpperCase() + today.slice(1)}
        actions={
          <>
            <ButtonLink to={appPath('/companies?add=1')} icon="plus">
              Adaugă firmă
            </ButtonLink>
            <ButtonAnchor
              href={connectUrl}
              variant="primary"
              icon="certificate"
            >
              Conectează certificat
            </ButtonAnchor>
          </>
        }
      />

      {companies.isError ? (
        <QueryError error={companies.error} retry={() => companies.refetch()} />
      ) : null}
      {connections.isError ? (
        <QueryError
          error={connections.error}
          retry={() => connections.refetch()}
        />
      ) : null}

      {expiring[0] ? (
        <Alert
          tone="warning"
          title={`Certificatul „${expiring[0].label}” expiră în ${pluralZile(Math.max(0, daysUntil(expiring[0].refreshExpiresAt)))}.`}
          action={
            <ButtonLink size="sm" to={appPath('/connections')}>
              Vezi certificatele
            </ButtonLink>
          }
        >
          {`Titularul trebuie să reautorizeze cu certificatul calificat; ${companiesOn(expiring[0]) === 1 ? 'o firmă depinde' : `${pluralFirme(companiesOn(expiring[0]))} depind`} de el.`}
          {expiring.length > 1
            ? ` Încă ${pluralCertificate(expiring.length - 1)} expiră curând.`
            : ''}
        </Alert>
      ) : null}
      {dead.length ? (
        <Alert
          tone="danger"
          title={`${dead.length === 1 ? 'Un certificat nu mai este valid' : `${dead.length} certificate nu mai sunt valide`}.`}
          action={
            <ButtonLink size="sm" to={appPath('/connections')}>
              Rezolvă
            </ButtonLink>
          }
        >
          Firmele legate de ele nu pot comunica cu ANAF până la o nouă
          autorizare.
        </Alert>
      ) : null}

      <div className="grid-stats">
        <Stat
          icon="building"
          label="Firme gestionate"
          value={companies.data ? list.length : '—'}
          note={
            withoutCert.length
              ? `${pluralFirme(withoutCert.length)} fără certificat`
              : 'toate au certificat'
          }
        />
        <Stat
          icon="certificate"
          label="Certificate valide"
          value={connections.data ? active.length : '—'}
          note={
            expiring.length
              ? `${expiring.length} expiră curând`
              : 'niciunul nu expiră curând'
          }
        />
        <Stat
          icon="invoice"
          label="Facturi primite azi"
          value="—"
          note="vedeți Mesaje e-Factura"
        />
        <Stat
          icon="truck"
          label="Transporturi deschise"
          value="—"
          note="e-Transport vine în faza 2"
        />
      </div>

      {invoiceStats.isError ? (
        <QueryError
          error={invoiceStats.error}
          retry={() => invoiceStats.refetch()}
        />
      ) : null}
      <div className="grid-2-1">
        <div className="grid-stats grid-stats-2">
          <Stat
            icon="invoice"
            label="Facturi emise luna aceasta"
            value={stats ? stats.month.invoices : '—'}
            note={
              stats
                ? stats.month.stornos
                  ? pluralStornari(stats.month.stornos)
                  : `${pluralFacturi(stats.year.invoices)} în acest an`
                : undefined
            }
          />
          <Stat
            icon="invoice"
            label="Facturat luna aceasta"
            value={stats ? `${formatAmount(stats.month.grossRon)} RON` : '—'}
            note={
              stats
                ? `${trend >= 0 ? '+' : '−'}${formatAmount(Math.abs(trend))} față de luna trecută`
                : undefined
            }
          />
          <Stat
            icon="invoice"
            label="TVA colectat luna aceasta"
            value={stats ? `${formatAmount(stats.month.vatRon)} RON` : '—'}
            note={
              stats ? `${formatAmount(stats.month.netRon)} RON fără TVA` : undefined
            }
          />
          <Stat
            icon="invoice"
            label="Facturat în acest an"
            value={stats ? `${formatAmount(stats.year.grossRon)} RON` : '—'}
            note={
              stats
                ? `${pluralFacturi(stats.year.invoices)}, ${pluralStornari(stats.year.stornos)}`
                : undefined
            }
          />
        </div>
        <Card
          title="Facturare, ultimele 6 luni"
          actions={
            <ButtonLink size="sm" variant="ghost" to={appPath('/invoices')}>
              Toate facturile
            </ButtonLink>
          }
        >
          {invoiceStats.isPending ? (
            <div className="muted">Se încarcă…</div>
          ) : stats ? (
            <ol className="bars">
              {stats.months.map((m) => (
                <li
                  key={m.month}
                  className="bar-col"
                  aria-label={`${formatMonth(m.month)} ${m.month.slice(0, 4)}: ${formatAmount(m.grossRon)} RON, ${pluralFacturi(m.invoices)}`}
                >
                  <div
                    className="bar"
                    style={{
                      height: `${peak > 0 ? Math.max(2, (Math.max(m.grossRon, 0) / peak) * 100) : 2}%`,
                    }}
                  />
                  <span className="muted small">{formatMonth(m.month)}</span>
                </li>
              ))}
            </ol>
          ) : null}
        </Card>
      </div>

      <div className="grid-2-1">
        <Card
          flush
          title="Firme fără certificat"
          subtitle="Nu pot trimite sau primi documente prin SPV"
          actions={
            <ButtonLink size="sm" variant="ghost" to={appPath('/companies')}>
              Toate firmele
            </ButtonLink>
          }
        >
          {companies.isPending ? (
            <div className="loading">Se încarcă…</div>
          ) : withoutCert.length === 0 ? (
            <EmptyState
              icon="check"
              title={
                list.length
                  ? 'Toate firmele au certificat.'
                  : 'Nu ați adăugat încă nicio firmă.'
              }
            >
              {list.length
                ? 'Fiecare firmă comunică cu ANAF printr-un certificat conectat.'
                : 'Adăugați clienții după CUI, apoi legați fiecare firmă de un certificat.'}
            </EmptyState>
          ) : (
            <DataTable
              caption="Firme fără certificat"
              rowKey={(r) => r.id}
              rows={withoutCert.slice(0, 8)}
              columns={[
                {
                  key: 'name',
                  header: 'Firmă',
                  render: (r) => (
                    <Link className="row-link" to={appPath(`/companies/${r.id}`)}>
                      {r.name}
                    </Link>
                  ),
                },
                {
                  key: 'cui',
                  header: 'CUI',
                  mono: true,
                  render: (r) => formatCui(r.cui),
                },
                {
                  key: 'st',
                  header: 'Stare',
                  render: () => <StatusBadge status="none" />,
                },
                {
                  key: 'a',
                  header: <span className="spv-sr-only">Acțiuni</span>,
                  render: (r) => (
                    <ButtonLink
                      size="sm"
                      variant="ghost"
                      icon="link"
                      to={appPath(`/companies/${r.id}`)}
                    >
                      Leagă certificat
                    </ButtonLink>
                  ),
                },
              ]}
            />
          )}
        </Card>

        <Card
          title="Certificate ANAF"
          actions={
            <ButtonAnchor
              size="sm"
              variant="ghost"
              icon="plus"
              href={connectUrl}
            >
              Adaugă
            </ButtonAnchor>
          }
        >
          {connections.isPending ? (
            <div className="muted">Se încarcă…</div>
          ) : conns.length === 0 ? (
            <p className="muted">
              Niciun certificat conectat. Conectați certificatul calificat al
              cabinetului sau trimiteți un link de autorizare clientului.
            </p>
          ) : (
            <div className="stack-sm">
              {conns.slice(0, 5).map((c) => (
                <div key={c.id} className="cert-row">
                  <div style={{ minWidth: 0 }}>
                    <div className="strong">{c.label}</div>
                    <div className="mono muted small">
                      {groupSerial(c.certSerial)} ·{' '}
                      {pluralFirme(companiesOn(c))}
                    </div>
                  </div>
                  <StatusBadge status={connectionStatus(c)} />
                </div>
              ))}
            </div>
          )}
          {conns.length > 5 ? (
            <Link to={appPath('/connections')}>Toate certificatele</Link>
          ) : null}
        </Card>
      </div>
    </>
  );
}
