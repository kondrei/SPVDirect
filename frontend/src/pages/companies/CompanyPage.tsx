import { useState, type SubmitEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import {
  useCompany,
  useCreateAuthorizationLink,
  useDeleteCompany,
  useExportCompany,
  useUpdateCompany,
} from '../../api/hooks/companies';
import { useConnections, useConnectUrl } from '../../api/hooks/connections';
import { ApiError } from '../../api/client';
import { AnafDataCard } from '../../components/AnafDataCard';
import {
  InvoiceDetailsCard,
  LogoCard,
} from '../../components/invoices/CompanyInvoicingCards';
import { CopyField } from '../../components/CopyField';
import { EmptyState } from '../../components/EmptyState';
import { PageHead } from '../../components/PageHead';
import { QueryError } from '../../components/QueryError';
import {
  Alert,
  Badge,
  Button,
  ButtonAnchor,
  ButtonLink,
  Card,
  StatusBadge,
  TextField,
} from '../../components/ui';
import { useAppPath } from '../../hooks/useAppPath';
import {
  connectionStatus,
  formatCui,
  formatDate,
  formatDateTime,
  groupSerial,
} from '../../lib/format';
import { SelectField } from '../../components/SelectField';

function CertificateCard({
  companyId,
  current,
}: Readonly<{
  companyId: number;
  current: number | null;
}>) {
  const connections = useConnections();
  const update = useUpdateCompany(companyId);
  const appPath = useAppPath();
  const [choice, setChoice] = useState(current ? String(current) : '');
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
            <SelectField
              id="cert-select"
              label={conn ? 'Schimbă certificatul' : 'Alege un certificat'}
              value={choice}
              onChange={(e) => setChoice(e.target.value)}
            >
              <option value="">Fără certificat</option>
              {usable.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label} · {groupSerial(c.certSerial)}
                </option>
              ))}
            </SelectField>
            <Button
              variant="primary"
              disabled={choice === (current ? String(current) : '')}
              loading={update.isPending}
              onClick={() =>
                update.mutate({ anafConnectionId: choice ? Number(choice) : null })
              }
            >
              Salvează
            </Button>
          </div>
        ) : null}
        {!usable.length && connections.data ? (
          <p className="muted">
            Nu aveți încă niciun certificat conectat.{' '}
            <Link to={appPath('/connections')}>Conectați unul</Link> sau folosiți linkul de
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
}: Readonly<{
  companyId: number;
  companyName: string;
}>) {
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

function ExportCompany({ id, cui }: Readonly<{ id: number; cui: string }>) {
  const exportData = useExportCompany();
  return (
    <div className="stack">
      <div className="spv-row" style={{ justifyContent: 'space-between' }}>
        <span className="muted small">
          Arhivă ZIP cu datele firmei: facturi (PDF și XML), mesaje SPV și încărcări e-Factura.
        </span>
        <Button
          size="sm"
          icon="download"
          loading={exportData.isPending}
          onClick={() => exportData.mutate({ id, cui })}
        >
          Descarcă arhiva firmei
        </Button>
      </div>
      {exportData.isError ? <Alert tone="danger" title={exportData.error.message} /> : null}
    </div>
  );
}

function DeleteCompany({ id, cui }: Readonly<{ id: number; cui: string }>) {
  const remove = useDeleteCompany();
  const exportData = useExportCompany();
  const navigate = useNavigate();
  const appPath = useAppPath();
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <div className="spv-row" style={{ justifyContent: 'space-between' }}>
        <span className="muted small">
          Ștergerea scoate firma și datele ei din SPVDirect; datele din SPV rămân la ANAF.
        </span>
        <Button size="sm" variant="ghost" icon="trash" onClick={() => setOpen(true)}>
          Șterge firma
        </Button>
      </div>
    );
  }

  const exported = exportData.isSuccess;
  const cancel = () => {
    setOpen(false);
    exportData.reset();
    remove.reset();
  };
  const confirm = () =>
    remove.mutate(id, {
      onSuccess: () => navigate(appPath('/companies'), { replace: true }),
    });

  return (
    <div className="stack">
      <Alert tone="warning" title="Exportați datele firmei înainte de ștergere?">
        Ștergerea elimină firma și toate datele ei din SPVDirect: facturile, mesajele SPV și
        încărcările e-Factura. Datele se șterg definitiv după 30 de zile, iar apoi SPVDirect nu mai
        păstrează nicio copie. Facturile trebuie păstrate 10 ani (Legea contabilității, art. 25),
        așa că vă recomandăm să descărcați mai întâi arhiva ZIP.
      </Alert>
      {exportData.isError ? <Alert tone="danger" title={exportData.error.message} /> : null}
      {exported ? <Alert tone="success" title="Arhiva cu datele firmei a fost descărcată." /> : null}
      {remove.isError ? <Alert tone="danger" title={remove.error.message} /> : null}
      <div className="spv-row">
        <Button
          size="sm"
          variant={exported ? 'secondary' : 'primary'}
          icon="download"
          loading={exportData.isPending}
          disabled={remove.isPending}
          onClick={() => exportData.mutate({ id, cui })}
        >
          {exported ? 'Exportă din nou' : 'Exportă datele (ZIP)'}
        </Button>
        <Button
          size="sm"
          variant="danger"
          icon="trash"
          loading={remove.isPending}
          disabled={exportData.isPending}
          onClick={confirm}
        >
          {exported ? 'Șterge firma' : 'Șterge fără export'}
        </Button>
        <Button size="sm" variant="ghost" disabled={remove.isPending} onClick={cancel}>
          Renunță
        </Button>
      </div>
    </div>
  );
}

function DetailsCard({
  id,
  name,
  cui,
  createdAt,
}: Readonly<{
  id: number;
  name: string;
  cui: string;
  createdAt: string;
}>) {
  const update = useUpdateCompany(id);
  const [value, setValue] = useState(name);
  const submit = (e: SubmitEvent) => {
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
        <div className="form-row">
          <TextField
            label="Denumire"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            maxLength={255}
            error={value.trim() ? undefined : 'Completați denumirea.'}
          />
          <Button
            type="submit"
            disabled={!value.trim() || value.trim() === name}
            loading={update.isPending}
          >
            Redenumește
          </Button>
        </div>
        <ExportCompany id={id} cui={cui} />
        <DeleteCompany id={id} cui={cui} />
      </form>
    </Card>
  );
}

export function CompanyPage() {
  const { id = '' } = useParams();
  const appPath = useAppPath();
  const connectUrl = useConnectUrl();
  const company = useCompany(/^\d+$/.test(id) ? Number(id) : 0);

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
            actions={<ButtonLink to={appPath('/companies')}>Înapoi la firme</ButtonLink>}
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
            <Link to={appPath('/companies')}>Firme</Link> › {c.name}
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
          <>
            <ButtonLink to={appPath(`/efactura/archive?companyId=${c.id}`)}>
              Arhivă e-Factura
            </ButtonLink>
            {c.anafConnectionId ? null : (
              <ButtonAnchor
                variant="primary"
                icon="certificate"
                href={connectUrl}
              >
                Conectează certificat
              </ButtonAnchor>
            )}
          </>
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
          <LogoCard company={c} />
        </div>
        <div className="stack">
          <DetailsCard
            key={c.name}
            id={c.id}
            name={c.name}
            cui={c.cui}
            createdAt={c.createdAt}
          />
          <InvoiceDetailsCard
            key={`${c.iban}|${c.bankName}|${c.email}|${c.phone}`}
            company={c}
          />
        </div>
      </div>
      <AnafDataCard company={c} />
    </>
  );
}
