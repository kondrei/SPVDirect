import { Link } from 'react-router';
import { useCompanies, useConnections, useMe } from '../api/hooks';
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
import { API_URL } from '../api/client';
import {
  connectionStatus,
  daysUntil,
  formatCui,
  groupSerial,
  pluralFirme,
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
  const today = todayFmt.format(new Date());

  const conns = connections.data ?? [];
  const list = companies.data ?? [];
  const byId = new Map(conns.map((c) => [c.id, c]));
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

  return (
    <>
      <PageHead
        title={name ? `Bună ziua, ${name}` : 'Panou'}
        context={today.charAt(0).toUpperCase() + today.slice(1)}
        actions={
          <>
            <ButtonLink to="/companies?add=1" icon="plus">
              Adaugă firmă
            </ButtonLink>
            <ButtonAnchor
              href={`${API_URL}/anaf/connect`}
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
            <ButtonLink size="sm" to="/connections">
              Vezi certificatele
            </ButtonLink>
          }
        >
          {`Titularul trebuie să reautorizeze cu certificatul calificat; ${companiesOn(expiring[0]) === 1 ? 'o firmă depinde' : `${pluralFirme(companiesOn(expiring[0]))} depind`} de el.`}
          {expiring.length > 1
            ? ` Încă ${expiring.length - 1} certificate expiră curând.`
            : ''}
        </Alert>
      ) : null}
      {dead.length ? (
        <Alert
          tone="danger"
          title={`${dead.length === 1 ? 'Un certificat nu mai este valid' : `${dead.length} certificate nu mai sunt valide`}.`}
          action={
            <ButtonLink size="sm" to="/connections">
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
          note="e-Factura vine în faza 2"
        />
        <Stat
          icon="truck"
          label="Transporturi deschise"
          value="—"
          note="e-Transport vine în faza 2"
        />
      </div>

      <div className="grid-2-1">
        <Card
          flush
          title="Firme fără certificat"
          subtitle="Nu pot trimite sau primi documente prin SPV"
          actions={
            <ButtonLink size="sm" variant="ghost" to="/companies">
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
                    <Link className="row-link" to={`/companies/${r.id}`}>
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
                      to={`/companies/${r.id}`}
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
              href={`${API_URL}/anaf/connect`}
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
          {byId.size > 5 ? (
            <Link to="/connections">Toate certificatele</Link>
          ) : null}
        </Card>
      </div>
    </>
  );
}
