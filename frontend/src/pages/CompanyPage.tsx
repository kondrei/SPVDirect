import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import {
  useCompany,
  useConnections,
  useCreateAuthorizationLink,
  useDeleteCompany,
  useUpdateCompany,
} from '../api/hooks';
import { API_URL, ApiError } from '../api/client';
import { AnafDataCard } from '../components/AnafDataCard';
import { ConfirmButton } from '../components/ConfirmButton';
import { CopyField } from '../components/CopyField';
import { EmptyState } from '../components/EmptyState';
import { PageHead } from '../components/PageHead';
import { QueryError } from '../components/QueryError';
import {
  Alert,
  Badge,
  Button,
  ButtonAnchor,
  ButtonLink,
  Card,
  StatusBadge,
  TextField,
} from '../components/ui';
import {
  connectionStatus,
  formatCui,
  formatDate,
  formatDateTime,
  groupSerial,
} from '../lib/format';

function CertificateCard({
  companyId,
  current,
}: {
  companyId: string;
  current: string | null;
}) {
  const connections = useConnections();
  const update = useUpdateCompany(companyId);
  const [choice, setChoice] = useState(current ?? '');
  const conn = connections.data?.find((c) => c.id === current);
  const usable = (connections.data ?? []).filter(
    (c) => connectionStatus(c) !== 'revoked',
  );

  return (
    <Card
      title="Certificat ANAF"
      subtitle="Cu ce certificat comunică SPVDirect cu ANAF pentru această firmă"
    >
      <div className="stack">
        {conn ? (
          <dl className="dl">
            <dt>Certificat</dt>
            <dd className="strong">{conn.label}</dd>
            <dt>Serie</dt>
            <dd className="mono">{groupSerial(conn.certSerial)}</dd>
            <dt>Stare</dt>
            <dd>
              <StatusBadge status={connectionStatus(conn)} />
            </dd>
            <dt>Valabil până</dt>
            <dd className="mono">{formatDate(conn.refreshExpiresAt)}</dd>
            <dt>Roluri</dt>
            <dd className="spv-row">
              {conn.roles.length ? (
                conn.roles.map((r) => (
                  <Badge key={r} tone="brand">
                    {r}
                  </Badge>
                ))
              ) : (
                <span className="muted">—</span>
              )}
            </dd>
          </dl>
        ) : (
          <Alert tone="warning" title="Firma nu are certificat.">
            Alegeți un certificat al cabinetului (de exemplu unul de
            împuternicit care acoperă acest CUI) sau trimiteți un link de
            autorizare titularului.
          </Alert>
        )}
        {update.isError ? (
          <Alert tone="danger" title={update.error.message} />
        ) : null}
        {usable.length ? (
          <div className="form-row">
            <div className="spv-field">
              <label className="spv-field-label" htmlFor="cert-select">
                {conn ? 'Schimbă certificatul' : 'Alege un certificat'}
              </label>
              <select
                id="cert-select"
                className="spv-input"
                value={choice}
                onChange={(e) => setChoice(e.target.value)}
              >
                <option value="">Fără certificat</option>
                {usable.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label} · {groupSerial(c.certSerial)}
                  </option>
                ))}
              </select>
            </div>
            <Button
              variant="primary"
              disabled={choice === (current ?? '')}
              loading={update.isPending}
              onClick={() =>
                update.mutate({ anafConnectionId: choice || null })
              }
            >
              Salvează
            </Button>
          </div>
        ) : connections.data ? (
          <p className="muted">
            Nu aveți încă niciun certificat conectat.{' '}
            <Link to="/connections">Conectați unul</Link> sau folosiți linkul de
            autorizare de mai jos.
          </p>
        ) : null}
      </div>
    </Card>
  );
}

function AuthorizationLinkCard({
  companyId,
  companyName,
}: {
  companyId: string;
  companyName: string;
}) {
  const create = useCreateAuthorizationLink(companyId);
  return (
    <Card
      title="Link de autorizare"
      subtitle="Pentru certificatul reprezentantului legal al firmei"
    >
      <div className="stack">
        <p className="muted">
          Titularul deschide linkul pe calculatorul lui, alege certificatul pe
          pagina ANAF și introduce PIN-ul. Certificatul autorizat se leagă
          automat de {companyName}.
        </p>
        {create.isError ? (
          <Alert tone="danger" title={create.error.message} />
        ) : null}
        {create.data ? (
          <>
            <CopyField value={create.data.url} label="Link de autorizare" />
            <Alert
              tone="info"
              title={`Valabil până la ${formatDateTime(create.data.expiresAt)}, o singură folosire.`}
            >
              Trimiteți-l doar titularului certificatului. Linkul nu mai poate
              fi afișat după ce părăsiți pagina; generați altul dacă e nevoie.
            </Alert>
          </>
        ) : null}
        <div>
          <Button
            icon="key"
            onClick={() => create.mutate()}
            loading={create.isPending}
          >
            {create.data ? 'Generează alt link' : 'Generează link'}
          </Button>
        </div>
      </div>
    </Card>
  );
}

function DetailsCard({
  id,
  name,
  cui,
  createdAt,
}: {
  id: string;
  name: string;
  cui: string;
  createdAt: string;
}) {
  const update = useUpdateCompany(id);
  const remove = useDeleteCompany();
  const navigate = useNavigate();
  const [value, setValue] = useState(name);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (value.trim() && value.trim() !== name)
      update.mutate({ name: value.trim() });
  };
  return (
    <Card title="Date firmă">
      <form onSubmit={submit} className="stack">
        <dl className="dl">
          <dt>CUI</dt>
          <dd className="mono">{formatCui(cui)}</dd>
          <dt>Adăugată</dt>
          <dd className="mono">{formatDate(createdAt)}</dd>
        </dl>
        {update.isError ? (
          <Alert tone="danger" title={update.error.message} />
        ) : null}
        {remove.isError ? (
          <Alert tone="danger" title={remove.error.message} />
        ) : null}
        <div className="form-row">
          <TextField
            label="Denumire"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            maxLength={255}
            error={!value.trim() ? 'Completați denumirea.' : undefined}
          />
          <Button
            type="submit"
            disabled={!value.trim() || value.trim() === name}
            loading={update.isPending}
          >
            Redenumește
          </Button>
        </div>
        <div className="spv-row" style={{ justifyContent: 'space-between' }}>
          <span className="muted small">
            Ștergerea scoate firma din SPVDirect; datele din SPV rămân la ANAF.
          </span>
          <ConfirmButton
            label="Șterge firma"
            confirmLabel="Confirmă ștergerea"
            loading={remove.isPending}
            onConfirm={() =>
              remove.mutate(id, {
                onSuccess: () => navigate('/companies', { replace: true }),
              })
            }
          />
        </div>
      </form>
    </Card>
  );
}

export function CompanyPage() {
  const { id = '' } = useParams();
  const company = useCompany(id);

  if (company.isPending) return <div className="loading">Se încarcă…</div>;
  if (company.isError) {
    if (
      company.error instanceof ApiError &&
      (company.error.status === 404 || company.error.status === 400)
    ) {
      return (
        <Card>
          <EmptyState
            icon="building"
            title="Firma nu a fost găsită."
            actions={<ButtonLink to="/companies">Înapoi la firme</ButtonLink>}
          >
            Poate a fost ștearsă sau linkul nu este corect.
          </EmptyState>
        </Card>
      );
    }
    return <QueryError error={company.error} retry={() => company.refetch()} />;
  }
  const c = company.data;
  return (
    <>
      <PageHead
        crumbs={
          <>
            <Link to="/companies">Firme</Link> › {c.name}
          </>
        }
        title={c.name}
        context={
          <span className="spv-row">
            <span className="mono">{formatCui(c.cui)}</span>
            {c.inactive ? <StatusBadge status="inactive" /> : null}
          </span>
        }
        actions={
          !c.anafConnectionId ? (
            <ButtonAnchor
              variant="primary"
              icon="certificate"
              href={`${API_URL}/anaf/connect`}
            >
              Conectează certificat
            </ButtonAnchor>
          ) : undefined
        }
      />
      <div className="grid-1-1">
        <div className="stack">
          <CertificateCard
            key={c.anafConnectionId ?? 'none'}
            companyId={c.id}
            current={c.anafConnectionId}
          />
          <AuthorizationLinkCard companyId={c.id} companyName={c.name} />
        </div>
        <DetailsCard
          key={c.name}
          id={c.id}
          name={c.name}
          cui={c.cui}
          createdAt={c.createdAt}
        />
      </div>
      <AnafDataCard company={c} />
    </>
  );
}
