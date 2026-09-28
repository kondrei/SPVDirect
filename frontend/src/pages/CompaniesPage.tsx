import {
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import {
  useCompanies,
  useConnections,
  useCreateCompanies,
  useCreateCompany,
} from '../api/hooks';
import type { BulkCompanyResult } from '../api/types';
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
  TextAreaField,
  TextField,
  type Status,
} from '../components/ui';
import { useAppPath } from '../hooks/useAppPath';
import {
  cuisFromFile,
  MAX_BULK_CUIS,
  MAX_CUI_FILE_BYTES,
  parseCuiList,
} from '../lib/cuiList';
import {
  connectionStatus,
  formatCui,
  normalizeCui,
  plural,
  pluralFirme,
} from '../lib/format';

const RESULT_STATUS: Record<BulkCompanyResult['status'], Status> = {
  created: 'added',
  exists: 'duplicate',
  not_found: 'notFound',
};

function listError(text: string): string | undefined {
  const { cuis, invalid } = parseCuiList(text);
  if (invalid.length) {
    const shown = invalid.slice(0, 5).join(', ');
    const more = invalid.length > 5 ? '…' : '';
    return `CUI invalid: ${shown}${more}. Fiecare CUI are 2–10 cifre, cu sau fără RO.`;
  }
  if (cuis.length === 0) return 'Introduceți cel puțin un CUI.';
  if (cuis.length > MAX_BULK_CUIS)
    return `Puteți adăuga cel mult ${MAX_BULK_CUIS} firme odată (ați introdus ${cuis.length}).`;
  return undefined;
}

function BulkResults({
  results,
  onAgain,
  onDone,
}: {
  results: BulkCompanyResult[];
  onAgain: () => void;
  onDone: () => void;
}) {
  const appPath = useAppPath();
  const count = (s: BulkCompanyResult['status']) =>
    results.filter((r) => r.status === s).length;
  const created = count('created');
  const exists = count('exists');
  const notFound = count('not_found');
  return (
    <Card title="Rezultatul adăugării">
      <div className="stack">
        <Alert
          tone={notFound ? 'warning' : 'success'}
          title={`Am adăugat ${pluralFirme(created)}.`}
        >
          {`${plural(exists, 'firmă exista', 'firme existau')} deja. ${plural(notFound, 'CUI nu a fost găsit', 'CUI-uri nu au fost găsite')} la ANAF.`}
          {notFound ? ' Verificați-le și încercați din nou.' : null}
        </Alert>
        <DataTable
          caption="Rezultatul adăugării"
          rowKey={(r) => r.cui}
          rows={results}
          columns={[
            {
              key: 'cui',
              header: 'CUI',
              mono: true,
              render: (r) => formatCui(r.cui),
            },
            {
              key: 'name',
              header: 'Firmă',
              render: (r) =>
                r.status === 'created' ? (
                  <Link
                    className="row-link"
                    to={appPath(`/companies/${r.company.id}`)}
                  >
                    {r.company.name}
                  </Link>
                ) : (
                  <span className="muted">—</span>
                ),
            },
            {
              key: 'st',
              header: 'Rezultat',
              render: (r) => <StatusBadge status={RESULT_STATUS[r.status]} />,
            },
          ]}
        />
        <div className="spv-row">
          <Button variant="primary" icon="plus" onClick={onAgain}>
            Adaugă alte firme
          </Button>
          <Button onClick={onDone}>Închide</Button>
        </div>
      </div>
    </Card>
  );
}

type FileNote = { tone: 'info' | 'danger'; message: string };

function AddCompanyForm({ onDone }: { onDone: () => void }) {
  const create = useCreateCompany();
  const createMany = useCreateCompanies();
  const navigate = useNavigate();
  const appPath = useAppPath();
  const fileInput = useRef<HTMLInputElement>(null);
  const [text, setText] = useState('');
  const [touched, setTouched] = useState(false);
  const [fileNote, setFileNote] = useState<FileNote | null>(null);
  const { cuis } = parseCuiList(text);
  const error = touched ? listError(text) : undefined;
  const pending = create.isPending || createMany.isPending;
  const failure = create.error ?? createMany.error;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (pending || listError(text)) return;
    if (cuis.length === 1) {
      createMany.reset();
      create.mutate(
        { cui: cuis[0] },
        {
          onSuccess: (company) =>
            navigate(appPath(`/companies/${company.id}`)),
        },
      );
    } else {
      create.reset();
      createMany.mutate(cuis);
    }
  };

  const loadFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > MAX_CUI_FILE_BYTES) {
      setFileNote({
        tone: 'danger',
        message: `Fișierul ${file.name} este prea mare. Încărcați un fișier de cel mult 1 MB.`,
      });
      return;
    }
    const found = cuisFromFile(await file.text());
    if (found.length === 0) {
      setFileNote({
        tone: 'danger',
        message: `Fișierul ${file.name} nu conține niciun CUI valid. Puneți câte un CUI pe fiecare rând.`,
      });
      return;
    }
    setText((prev) =>
      [prev.trim().replace(/[,;]$/, ''), found.join(', ')]
        .filter(Boolean)
        .join(', '),
    );
    setFileNote({
      tone: 'info',
      message: `Am citit ${plural(found.length, 'CUI', 'CUI-uri')} din ${file.name}.`,
    });
  };

  if (createMany.isSuccess) {
    return (
      <BulkResults
        results={createMany.data}
        onAgain={() => {
          createMany.reset();
          setText('');
          setTouched(false);
          setFileNote(null);
        }}
        onDone={onDone}
      />
    );
  }

  return (
    <Card
      title="Firme noi"
      subtitle="Introduceți unul sau mai multe CUI-uri, separate prin virgulă, sau încărcați un fișier .csv ori .txt cu câte un CUI pe rând. Denumirea și celelalte date se preiau automat de la ANAF; certificatul îl legați din pagina firmei."
    >
      <form onSubmit={submit} noValidate className="stack">
        {failure ? (
          <Alert tone="danger" title="Eroare server ANAF">
            {failure.message}
          </Alert>
        ) : null}
        {fileNote ? (
          <Alert tone={fileNote.tone}>{fileNote.message}</Alert>
        ) : null}
        <TextAreaField
          label="CUI-uri"
          mono
          rows={3}
          placeholder="RO 12345678, 87654321"
          value={text}
          onChange={(e) => setText(e.target.value)}
          hint="Cu sau fără prefixul RO, separate prin virgulă sau pe rânduri separate."
          error={error}
        />
        <input
          ref={fileInput}
          type="file"
          accept=".csv,.txt,text/csv,text/plain"
          hidden
          aria-label="Fișier cu CUI-uri"
          onChange={(e) => void loadFile(e)}
        />
        <div className="spv-row">
          <Button
            type="submit"
            variant="primary"
            icon="plus"
            loading={pending}
          >
            {pending
              ? 'Se caută la ANAF…'
              : cuis.length > 1
                ? `Adaugă ${pluralFirme(cuis.length)}`
                : 'Adaugă'}
          </Button>
          <Button
            icon="upload"
            onClick={() => fileInput.current?.click()}
            disabled={pending}
          >
            Încarcă fișier
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
                  <>
                    <Link className="row-link" to={appPath(`/companies/${r.id}`)}>
                      {r.name}
                    </Link>
                    {r.caen ? (
                      <div className="muted small">
                        CAEN {r.caen.code} · {r.caen.name}
                      </div>
                    ) : null}
                  </>
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
