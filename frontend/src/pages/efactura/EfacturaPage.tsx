import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { useCompanies } from '../../api/hooks/companies';
import { useDownloadUpload, useEfacturaUploads, useRefreshUpload, useUploadXml } from '../../api/hooks/efactura';
import type { EfacturaStandard, EfacturaUpload } from '../../api/types';
import { INVOICE_PAGE_SIZE } from '../../common/constants';
import { EfacturaStatusBadge } from '../../components/efactura/EfacturaStatusBadge';
import { EmptyState } from '../../components/EmptyState';
import { PageHead } from '../../components/PageHead';
import { QueryError } from '../../components/QueryError';
import { SelectField } from '../../components/SelectField';
import {
  Alert,
  Button,
  ButtonLink,
  Card,
  DataTable,
  type Column,
} from '../../components/ui';
import { useAppPath } from '../../hooks/useAppPath';
import { formatDateTime } from '../../lib/format';

const STANDARDS: { value: EfacturaStandard; label: string }[] = [
  { value: 'UBL', label: 'UBL, factură' },
  { value: 'CN', label: 'CN, notă de credit' },
  { value: 'CII', label: 'CII, factură' },
  { value: 'RASP', label: 'RASP, răspuns la factură' },
];

function UploadForm() {
  const companies = useCompanies();
  const upload = useUploadXml();
  const [companyId, setCompanyId] = useState('');
  const [standard, setStandard] = useState<EfacturaStandard>('UBL');
  const [file, setFile] = useState<File | null>(null);
  const [extern, setExtern] = useState(false);
  const [autofactura, setAutofactura] = useState(false);
  const [executare, setExecutare] = useState(false);
  const [b2c, setB2c] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!companyId) {
      setError('Alegeți firma pentru care se trimite fișierul.');
      return;
    }
    if (!file) {
      setError('Alegeți un fișier XML.');
      return;
    }
    setError(null);
    upload.mutate({
      companyId: Number(companyId),
      standard,
      file,
      extern,
      autofactura,
      executare,
      b2c,
    });
  };

  return (
    <Card
      title="Trimite un fișier XML"
      subtitle="Pentru facturi generate în alt program. Facturile emise aici se trimit din pagina Facturi."
    >
      <form className="stack" onSubmit={submit} noValidate>
        <div className="form-row">
          <SelectField
            label="Firma (furnizorul)"
            value={companyId}
            onChange={(e) => setCompanyId(e.target.value)}
          >
            <option value="">Alegeți firma</option>
            {(companies.data ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </SelectField>
          <SelectField
            label="Tip fișier"
            value={standard}
            onChange={(e) => setStandard(e.target.value as EfacturaStandard)}
          >
            {STANDARDS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </SelectField>
        </div>
        <div className="spv-field">
          <label className="spv-field-label" htmlFor="efactura-file">
            Fișier XML (maxim 10 MB)
          </label>
          <input
            id="efactura-file"
            className="spv-input"
            type="file"
            accept=".xml,text/xml,application/xml"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </div>
        <label className="check">
          <input
            type="checkbox"
            checked={extern}
            onChange={(e) => setExtern(e.target.checked)}
          />
          Cumpărătorul nu este din România
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={autofactura}
            onChange={(e) => setAutofactura(e.target.checked)}
          />
          Autofactură (emisă de beneficiar în numele furnizorului)
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={executare}
            onChange={(e) => setExecutare(e.target.checked)}
          />
          Depus de organul de executare în numele debitorului
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={b2c}
            onChange={(e) => setB2c(e.target.checked)}
          />
          Raportare B2C (către persoane fizice)
        </label>
        {error ? <Alert tone="danger" title={error} /> : null}
        {upload.isError ? (
          <Alert tone="danger" title="Fișierul nu a fost trimis.">
            {upload.error.message}
          </Alert>
        ) : null}
        {upload.isSuccess ? (
          upload.data.status === 'rejected' ? (
            <Alert tone="danger" title="ANAF a refuzat fișierul.">
              {upload.data.errorMessage}
            </Alert>
          ) : (
            <Alert
              tone="success"
              title={`Fișierul a fost trimis. Index ANAF: ${upload.data.uploadIndex}.`}
            >
              Verificați starea în lista de mai sus după câteva momente.
            </Alert>
          )
        ) : null}
        <div className="spv-row">
          <Button
            type="submit"
            variant="primary"
            icon="upload"
            loading={upload.isPending}
          >
            Trimite la ANAF
          </Button>
        </div>
      </form>
    </Card>
  );
}

export function EfacturaPage() {
  const appPath = useAppPath();
  const companies = useCompanies();
  const [companyId, setCompanyId] = useState<number | undefined>();
  const [page, setPage] = useState(1);
  const uploads = useEfacturaUploads({ companyId, page });
  const refresh = useRefreshUpload();
  const download = useDownloadUpload();

  const names = new Map((companies.data ?? []).map((c) => [c.id, c.name]));
  const total = uploads.data?.total ?? 0;
  const lastPage = Math.max(1, Math.ceil(total / INVOICE_PAGE_SIZE));

  const columns: Column<EfacturaUpload>[] = [
    {
      key: 'createdAt',
      header: 'Trimis',
      mono: true,
      render: (u) => formatDateTime(u.createdAt),
    },
    {
      key: 'company',
      header: 'Firmă',
      render: (u) => names.get(u.companyId) ?? `Firma ${u.companyId}`,
    },
    {
      key: 'source',
      header: 'Document',
      render: (u) =>
        u.invoiceId ? (
          <Link className="row-link" to={appPath('/invoices')}>
            Factură emisă
          </Link>
        ) : (
          `Fișier ${u.standard}`
        ),
    },
    {
      key: 'index',
      header: 'Index ANAF',
      mono: true,
      render: (u) => (
        <>
          {u.uploadIndex ?? '—'}
          <div className="muted small">{u.environment}</div>
        </>
      ),
    },
    {
      key: 'status',
      header: 'Stare',
      render: (u) => (
        <>
          <EfacturaStatusBadge status={u.status} />
          {u.errorMessage ? (
            <div className="muted small">{u.errorMessage}</div>
          ) : null}
          {u.checkedAt ? (
            <div className="muted small">
              Verificat {formatDateTime(u.checkedAt)}
            </div>
          ) : null}
        </>
      ),
    },
    {
      key: 'actions',
      header: <span className="spv-sr-only">Acțiuni</span>,
      render: (u) => (
        <span className="spv-row">
          {u.status === 'processing' ? (
            <Button
              size="sm"
              aria-label={`Verifică starea ${u.uploadIndex}`}
              loading={refresh.isPending && refresh.variables === u.id}
              onClick={() => refresh.mutate(u.id)}
            >
              Verifică starea
            </Button>
          ) : null}
          {u.downloadId ? (
            <Button
              size="sm"
              icon="download"
              aria-label={`Descarcă răspunsul ${u.uploadIndex}`}
              loading={download.isPending && download.variables === u.id}
              onClick={() => download.mutate(u.id)}
            >
              Răspuns ANAF
            </Button>
          ) : null}
        </span>
      ),
    },
  ];

  return (
    <>
      <PageHead
        title="e-Factura"
        context="Facturi trimise la ANAF prin RO e-Factura și starea lor."
        actions={
          <>
            <ButtonLink to={appPath('/efactura/messages')}>
              Mesaje ANAF
            </ButtonLink>
            <ButtonLink to={appPath('/efactura/validator')}>Validator</ButtonLink>
          </>
        }
      />
      <Card>
        <div className="stack">
          <div className="form-row">
            <SelectField
              label="Firma"
              value={companyId ?? ''}
              onChange={(e) => {
                setCompanyId(e.target.value ? Number(e.target.value) : undefined);
                setPage(1);
              }}
            >
              <option value="">Toate firmele</option>
              {(companies.data ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </SelectField>
          </div>
          {refresh.isError ? (
            <Alert tone="danger" title="Starea nu a putut fi verificată.">
              {refresh.error.message}
            </Alert>
          ) : null}
          {download.isError ? (
            <Alert tone="danger" title="Descărcarea a eșuat.">
              {download.error.message}
            </Alert>
          ) : null}
          {uploads.isError ? (
            <QueryError error={uploads.error} retry={() => uploads.refetch()} />
          ) : null}
          {uploads.isPending ? (
            <div className="loading">Se încarcă…</div>
          ) : uploads.data && uploads.data.items.length === 0 ? (
            <EmptyState icon="invoice" title="Nicio factură trimisă la ANAF.">
              Trimiteți o factură din pagina Facturi sau încărcați un fișier XML
              mai jos.
            </EmptyState>
          ) : uploads.data ? (
            <>
              <DataTable
                caption="Încărcări e-Factura"
                columns={columns}
                rows={uploads.data.items}
                rowKey={(u) => u.id}
              />
              <div className="spv-row">
                <Button
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage(page - 1)}
                >
                  Anterioare
                </Button>
                <span className="muted">
                  Pagina {page} din {lastPage}
                </span>
                <Button
                  size="sm"
                  disabled={page >= lastPage}
                  onClick={() => setPage(page + 1)}
                >
                  Următoarele
                </Button>
              </div>
            </>
          ) : null}
        </div>
      </Card>
      <UploadForm />
    </>
  );
}
