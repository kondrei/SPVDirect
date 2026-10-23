import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { useCompanies } from '../api/hooks/companies';
import { useConnections, useConnectUrl } from '../api/hooks/connections';
import { useInvoiceStats } from '../api/hooks/invoices';
import { useMe } from '../api/hooks/auth';
import type { AnafConnection, Company, InvoiceStats } from '../api/types';
import { ActivityCard } from '../components/ActivityCard';
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

function ExpiringAlert({
  expiring,
  companiesOn,
}: Readonly<{
  expiring: AnafConnection[];
  companiesOn: (c: AnafConnection) => number;
}>) {
  const appPath = useAppPath();
  const first = expiring[0];
  if (!first) return null;
  const count = companiesOn(first);
  const dependents =
    count === 1 ? 'o firmă depinde' : `${pluralFirme(count)} depind`;
  return (
    <Alert
      tone="warning"
      title={`Certificatul „${first.label}” expiră în ${pluralZile(Math.max(0, daysUntil(first.refreshExpiresAt)))}.`}
      action={
        <ButtonLink size="sm" to={appPath('/connections')}>
          Vezi certificatele
        </ButtonLink>
      }
    >
      {`Titularul trebuie să reautorizeze cu certificatul calificat; ${dependents} de el.`}
      {expiring.length > 1
        ? ` Încă ${pluralCertificate(expiring.length - 1)} expiră curând.`
        : ''}
    </Alert>
  );
}

function DeadAlert({ dead }: Readonly<{ dead: AnafConnection[] }>) {
  const appPath = useAppPath();
  if (!dead.length) return null;
  const title =
    dead.length === 1
      ? 'Un certificat nu mai este valid'
      : `${dead.length} certificate nu mai sunt valide`;
  return (
    <Alert
      tone="danger"
      title={`${title}.`}
      action={
        <ButtonLink size="sm" to={appPath('/connections')}>
          Rezolvă
        </ButtonLink>
      }
    >
      Firmele legate de ele nu pot comunica cu ANAF până la o nouă
      autorizare.
    </Alert>
  );
}

function monthInvoicesNote(stats: InvoiceStats): string {
  return stats.month.stornos
    ? pluralStornari(stats.month.stornos)
    : `${pluralFacturi(stats.year.invoices)} în acest an`;
}

function trendNote(stats: InvoiceStats): string {
  const trend = stats.month.grossRon - stats.previousMonth.grossRon;
  const sign = trend >= 0 ? '+' : '−';
  return `${sign}${formatAmount(Math.abs(trend))} față de luna trecută`;
}

function InvoiceStatCards({ stats }: Readonly<{ stats: InvoiceStats | undefined }>) {
  return (
    <div className="grid-stats grid-stats-2">
      <Stat
        icon="invoice"
        label="Facturi emise luna aceasta"
        value={stats ? stats.month.invoices : '—'}
        note={stats ? monthInvoicesNote(stats) : undefined}
      />
      <Stat
        icon="invoice"
        label="Facturat luna aceasta"
        value={stats ? `${formatAmount(stats.month.grossRon)} RON` : '—'}
        note={stats ? trendNote(stats) : undefined}
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
  );
}

function barHeight(grossRon: number, peak: number): number {
  return peak > 0 ? Math.max(2, (Math.max(grossRon, 0) / peak) * 100) : 2;
}

function InvoiceChart({ stats }: Readonly<{ stats: InvoiceStats }>) {
  const peak = Math.max(...stats.months.map((m) => m.grossRon), 0);
  return (
    <ol className="bars">
      {stats.months.map((m) => (
        <li
          key={m.month}
          className="bar-col"
          aria-label={`${formatMonth(m.month)} ${m.month.slice(0, 4)}: ${formatAmount(m.grossRon)} RON, ${pluralFacturi(m.invoices)}`}
        >
          <div
            className="bar"
            style={{ height: `${barHeight(m.grossRon, peak)}%` }}
          />
          <span className="muted small">{formatMonth(m.month)}</span>
        </li>
      ))}
    </ol>
  );
}

function WithoutCertificateCard({
  pending,
  list,
  withoutCert,
}: Readonly<{
  pending: boolean;
  list: Company[];
  withoutCert: Company[];
}>) {
  const appPath = useAppPath();
  let body: ReactNode;
  if (pending) {
    body = <div className="loading">Se încarcă…</div>;
  } else if (withoutCert.length === 0) {
    body = (
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
    );
  } else {
    body = (
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
    );
  }
  return (
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
      {body}
    </Card>
  );
}

function CertificatesCard({
  pending,
  conns,
  companiesOn,
}: Readonly<{
  pending: boolean;
  conns: AnafConnection[];
  companiesOn: (c: AnafConnection) => number;
}>) {
  const appPath = useAppPath();
  const connectUrl = useConnectUrl();
  let body: ReactNode;
  if (pending) {
    body = <div className="muted">Se încarcă…</div>;
  } else if (conns.length === 0) {
    body = (
      <p className="muted">
        Niciun certificat conectat. Conectați certificatul calificat al
        cabinetului sau trimiteți un link de autorizare clientului.
      </p>
    );
  } else {
    body = (
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
    );
  }
  return (
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
      {body}
      {conns.length > 5 ? (
        <Link to={appPath('/connections')}>Toate certificatele</Link>
      ) : null}
    </Card>
  );
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

  return (
    <div className="dashboard">
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

      <ExpiringAlert expiring={expiring} companiesOn={companiesOn} />
      <DeadAlert dead={dead} />

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
        <InvoiceStatCards stats={stats} />
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
          ) : null}
          {stats ? <InvoiceChart stats={stats} /> : null}
        </Card>
      </div>

      <div className="grid-2-1">
        <WithoutCertificateCard
          pending={companies.isPending}
          list={list}
          withoutCert={withoutCert}
        />
        <CertificatesCard
          pending={connections.isPending}
          conns={conns}
          companiesOn={companiesOn}
        />
      </div>

      <ActivityCard companies={list} />
    </div>
  );
}
