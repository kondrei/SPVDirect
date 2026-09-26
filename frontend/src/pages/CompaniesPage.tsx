import { useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { useCompanies, useConnections, useCreateCompany } from '../api/hooks';
import { EmptyState } from '../components/EmptyState';
import { PageHead } from '../components/PageHead';
import { QueryError } from '../components/QueryError';
import {
  Alert,
  Button,
  ButtonLink,
  Card,
  DataTable,
  StatusBadge,
  TextField,
} from '../components/ui';
import { useAppPath } from '../hooks/useAppPath';
import {
  connectionStatus,
  formatCui,
  isValidCui,
  normalizeCui,
  pluralFirme,
} from '../lib/format';

function AddCompanyForm({ onDone }: { onDone: () => void }) {
  const create = useCreateCompany();
  const navigate = useNavigate();
  const appPath = useAppPath();
  const [cui, setCui] = useState('');
  const [touched, setTouched] = useState(false);
  const cuiError =
    touched && !isValidCui(cui)
      ? 'CUI invalid: 2–10 cifre, cu sau fără RO.'
      : undefined;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!isValidCui(cui)) return;
    create.mutate(
      { cui: normalizeCui(cui) },
      { onSuccess: (company) => navigate(appPath(`/companies/${company.id}`)) },
    );
  };

  return (
    <Card
      title="Firmă nouă"
      subtitle="Introduceți CUI-ul. Denumirea și celelalte date se preiau automat de la ANAF; certificatul îl legați din pagina firmei."
    >
      <form onSubmit={submit} noValidate className="stack">
        {create.isError ? (
          <Alert
            tone="danger"
            title={`Eroare server ANAF`}
            children={create.error.message}
          />
        ) : null}
        <div className="form-row">
          <TextField
            label="CUI"
            mono
            placeholder="RO 12345678"
            value={cui}
            onChange={(e) => setCui(e.target.value)}
            hint="Cu sau fără prefixul RO"
            error={cuiError}
          />
          <Button
            type="submit"
            variant="primary"
            icon="plus"
            loading={create.isPending}
          >
            {create.isPending ? 'Se caută la ANAF…' : 'Adaugă'}
          </Button>
          <Button onClick={onDone}>Renunță</Button>
        </div>
      </form>
    </Card>
  );
}

export function CompaniesPage() {
  const companies = useCompanies();
  const connections = useConnections();
  const appPath = useAppPath();
  const [params, setParams] = useSearchParams();
  const adding = params.get('add') === '1';
  const [q, setQ] = useState('');
  const setAdding = (on: boolean) =>
    setParams(on ? { add: '1' } : {}, { replace: true });

  const byId = useMemo(
    () => new Map((connections.data ?? []).map((c) => [c.id, c])),
    [connections.data],
  );
  const rows = useMemo(() => {
    const needle = normalizeCui(q).toLowerCase();
    const all = companies.data ?? [];
    if (!needle) return all;
    return all.filter(
      (c) =>
        c.name.toLowerCase().includes(q.trim().toLowerCase()) ||
        c.cui.includes(needle),
    );
  }, [companies.data, q]);
  const total = companies.data?.length ?? 0;
  const without =
    companies.data?.filter((c) => !c.anafConnectionId).length ?? 0;

  return (
    <>
      <PageHead
        title="Firme"
        context={
          companies.data
            ? `${pluralFirme(total)} · ${without} fără certificat`
            : undefined
        }
        actions={
          !adding ? (
            <Button
              variant="primary"
              icon="plus"
              onClick={() => setAdding(true)}
            >
              Adaugă firmă
            </Button>
          ) : undefined
        }
      />
      {adding ? <AddCompanyForm onDone={() => setAdding(false)} /> : null}
      {companies.isError ? (
        <QueryError error={companies.error} retry={() => companies.refetch()} />
      ) : null}

      {total > 0 ? (
        <TextField
          icon="search"
          placeholder="Caută după denumire sau CUI"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Caută firme"
        />
      ) : null}

      <Card flush>
        {companies.isPending ? (
          <div className="loading">Se încarcă…</div>
        ) : total === 0 ? (
          <EmptyState
            icon="building"
            title="Nu ați adăugat încă nicio firmă."
            actions={
              !adding ? (
                <Button
                  variant="primary"
                  icon="plus"
                  onClick={() => setAdding(true)}
                >
                  Adaugă prima firmă
                </Button>
              ) : undefined
            }
          >
            Adăugați clienții după CUI. Pentru fiecare firmă alegeți apoi
            certificatul cu care SPVDirect comunică cu ANAF.
          </EmptyState>
        ) : rows.length === 0 ? (
          <EmptyState
            icon="search"
            title="Nicio firmă nu corespunde căutării."
          />
        ) : (
          <DataTable
            caption="Firme"
            rowKey={(r) => r.id}
            rows={rows}
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
                key: 'tva',
                header: 'Plătitor TVA',
                render: (r) =>
                  r.vatPayer == null && !r.inactive ? (
                    <span className="muted">—</span>
                  ) : (
                    <span className="spv-row">
                      {r.vatPayer != null ? (
                        <StatusBadge status={r.vatPayer ? 'yes' : 'no'} />
                      ) : null}
                      {r.inactive ? <StatusBadge status="inactive" /> : null}
                    </span>
                  ),
              },
              {
                key: 'cert',
                header: 'Certificat',
                render: (r) => {
                  const c = r.anafConnectionId
                    ? byId.get(r.anafConnectionId)
                    : undefined;
                  return c ? c.label : <span className="muted">—</span>;
                },
              },
              {
                key: 'st',
                header: 'Stare',
                render: (r) => {
                  const c = r.anafConnectionId
                    ? byId.get(r.anafConnectionId)
                    : undefined;
                  return (
                    <StatusBadge status={c ? connectionStatus(c) : 'none'} />
                  );
                },
              },
              {
                key: 'a',
                header: <span className="spv-sr-only">Acțiuni</span>,
                render: (r) => (
                  <ButtonLink
                    size="sm"
                    variant="ghost"
                    to={appPath(`/companies/${r.id}`)}
                  >
                    Detalii
                  </ButtonLink>
                ),
              },
            ]}
          />
        )}
      </Card>
    </>
  );
}
