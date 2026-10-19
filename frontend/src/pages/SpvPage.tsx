import { useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { useConnections } from '../api/hooks/connections';
import {
  useCreateSpvRequest,
  useDownloadSpvMessage,
  useImportSpvMessages,
  useSpvArchive,
  useUploadSpvDocument,
  type SpvArchiveQuery,
} from '../api/hooks/spv';
import type { ArchivedSpvMessage, SpvImportSummary } from '../api/types';
import {
  ANAF_SPV_WEB_URL,
  MAX_BULK_CUIS,
  MAX_SPV_DAYS,
  MAX_SPV_IMPORT_BYTES,
  MAX_SPV_PDF_BYTES,
  SPV_PAGE_SIZE,
} from '../common/constants';
import {
  SPV_INCOME_REASONS,
  SPV_REQUEST_TYPES,
  spvRequestError,
  spvRequestPayload,
  spvRequestType,
  usesField,
  type SpvRequestField,
} from '../common/spvRequests';
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
  DataTable,
  StatusBadge,
  TextAreaField,
  TextField,
  type Column,
} from '../components/ui';
import { useAppPath } from '../hooks/useAppPath';
import {
  connectionStatus,
  groupSerial,
  normalizeCui,
  plural,
} from '../lib/format';
import { SelectField } from '../components/SelectField';

const DIGITS = /^\d{2,13}$/;

interface Certificate {
  id: number;
  label: string;
  certSerial: string;
}

function ConnectionSelect({
  id,
  value,
  onChange,
  options,
}: {
  id: string;
  value: number;
  onChange: (v: number) => void;
  options: Certificate[];
}) {
  return (
    <SelectField
      id={id}
      label="Certificat"
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
    >
      {options.map((c) => (
        <option key={c.id} value={c.id}>
          {c.label} · {groupSerial(c.certSerial)}
        </option>
      ))}
    </SelectField>
  );
}

function ImportResult({ summary }: { summary: SpvImportSummary }) {
  const appPath = useAppPath();
  const { fetched, added, notice, certSerial, rights, unknownCuis } = summary;
  const toAdd = unknownCuis.slice(0, MAX_BULK_CUIS);
  return (
    <>
      <Alert tone="success" title="Import încheiat.">
        <div className="stack-sm">
          <span>
            {notice
              ? `ANAF: ${notice}.`
              : `${fetched} mesaje în listă, ${added} noi${
                  fetched > added ? `, ${fetched - added} existau deja.` : '.'
                }`}
          </span>
          {certSerial || rights > 0 ? (
            <span className="muted">
              {certSerial ? (
                <>
                  Certificat{' '}
                  <span className="mono">{groupSerial(certSerial)}</span>
                </>
              ) : (
                'Certificatul'
              )}
              {rights > 0
                ? ` · drepturi SPV pentru ${plural(rights, 'CUI/CNP', 'CUI/CNP-uri')}`
                : null}
            </span>
          ) : null}
        </div>
      </Alert>
      {toAdd.length > 0 ? (
        <Alert
          tone="info"
          title={`${plural(unknownCuis.length, 'firmă', 'firme')} din certificat nu ${
            unknownCuis.length === 1 ? 'este' : 'sunt'
          } în lista dvs. de firme.`}
        >
          <div className="stack-sm">
            <span className="mono">
              {toAdd.slice(0, 10).join(', ')}
              {unknownCuis.length > 10 ? '…' : ''}
            </span>
            <div>
              <ButtonLink
                size="sm"
                icon="plus"
                to={appPath(`/companies?add=1&cuis=${toAdd.join(',')}`)}
              >
                Adaugă în Firme
              </ButtonLink>
            </div>
          </div>
        </Alert>
      ) : null}
    </>
  );
}

function ImportCard() {
  const [zile, setZile] = useState(String(MAX_SPV_DAYS));
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const importer = useImportSpvMessages();

  const days = Number(zile);
  const validDays = Number.isInteger(days) && days >= 1 && days <= MAX_SPV_DAYS;
  const anafUrl = `${ANAF_SPV_WEB_URL}/listaMesaje?zile=${validDays ? days : MAX_SPV_DAYS}`;

  const loadFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > MAX_SPV_IMPORT_BYTES) {
      setError('Fișierul poate avea cel mult 5 MB.');
      return;
    }
    setError(null);
    setText(await file.text());
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim()) {
      setError('Lipiți textul copiat de la ANAF sau încărcați fișierul salvat.');
      return;
    }
    setError(null);
    importer.mutate(text.trim(), { onSuccess: () => setText('') });
  };

  return (
    <Card
      title="Importă mesaje din ANAF"
      subtitle="ANAF dă lista de mesaje doar browserului care are certificatul digital, așa că o aduceți dvs. aici."
    >
      <form className="stack" onSubmit={submit} noValidate>
        <ol className="spv-steps">
          <li>
            Alegeți perioada (cel mult {MAX_SPV_DAYS} de zile) și apăsați
            „Deschide lista la ANAF”. Browserul vă cere certificatul; lista
            cuprinde mesajele tuturor CUI/CNP-urilor pentru care certificatul
            are drepturi.
          </li>
          <li>
            Copiați tot textul afișat (Ctrl+A, Ctrl+C) și lipiți-l mai jos, sau
            salvați pagina și încărcați fișierul.
          </li>
          <li>
            În „Mesaje salvate”, „Deschide la ANAF” descarcă PDF-ul fiecărui
            mesaj; încărcați-l înapoi cu „Încarcă PDF” ca să rămână în arhivă.
          </li>
        </ol>
        <div className="form-row">
          <TextField
            label="Ultimele zile"
            type="number"
            min={1}
            max={MAX_SPV_DAYS}
            value={zile}
            onChange={(e) => setZile(e.target.value)}
            hint={`Cel mult ${MAX_SPV_DAYS} de zile`}
            error={validDays ? undefined : `Între 1 și ${MAX_SPV_DAYS}.`}
          />
          <ButtonAnchor
            href={anafUrl}
            target="_blank"
            rel="noopener noreferrer"
            icon="link"
          >
            Deschide lista la ANAF
          </ButtonAnchor>
        </div>
        <TextAreaField
          label="Lista de mesaje de la ANAF"
          mono
          rows={6}
          placeholder='{"titlu":"Lista Mesaje disponibile din ultimele 60 zile","mesaje":[…]}'
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <input
          ref={fileInput}
          type="file"
          accept=".json,.txt,application/json,text/plain"
          hidden
          aria-label="Fișier cu lista de mesaje"
          onChange={(e) => void loadFile(e)}
        />
        {error ? <Alert tone="danger" title={error} /> : null}
        {importer.isError ? (
          <Alert tone="danger" title="Importul a eșuat.">
            {importer.error.message}
          </Alert>
        ) : null}
        {importer.isSuccess ? <ImportResult summary={importer.data} /> : null}
        <div className="spv-row">
          <Button
            type="submit"
            variant="primary"
            icon="download"
            loading={importer.isPending}
          >
            Importă mesajele
          </Button>
          <Button icon="upload" onClick={() => fileInput.current?.click()}>
            Încarcă fișier
          </Button>
        </div>
      </form>
    </Card>
  );
}

function UploadPdfButton({
  message,
  loading,
  onPick,
}: {
  message: ArchivedSpvMessage;
  loading: boolean;
  onPick: (file: File) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={input}
        type="file"
        accept=".pdf,application/pdf"
        hidden
        aria-label={`PDF pentru mesajul ${message.anafMessageId}`}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) onPick(file);
        }}
      />
      <Button
        size="sm"
        icon="upload"
        loading={loading}
        onClick={() => input.current?.click()}
      >
        Încarcă PDF
      </Button>
    </>
  );
}

function ArchiveCard() {
  const [cifInput, setCifInput] = useState('');
  const [query, setQuery] = useState<SpvArchiveQuery>({ page: 1 });
  const [error, setError] = useState<string | null>(null);
  const archive = useSpvArchive(query);
  const download = useDownloadSpvMessage();
  const upload = useUploadSpvDocument();

  const uploadPdf = (message: ArchivedSpvMessage, file: File) => {
    if (file.size > MAX_SPV_PDF_BYTES) {
      setError('PDF-ul poate avea cel mult 10 MB.');
      return;
    }
    setError(null);
    upload.mutate({ id: message.id, file });
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const cif = cifInput.replace(/\s+/g, '');
    if (cif && !DIGITS.test(cif)) {
      setError('CIF/CNP-ul trebuie să conțină doar cifre (2–13).');
      return;
    }
    setError(null);
    setQuery({ page: 1, ...(cif ? { cif } : {}) });
  };

  const total = archive.data?.total ?? 0;
  const lastPage = Math.max(1, Math.ceil(total / SPV_PAGE_SIZE));

  const columns: Column<ArchivedSpvMessage>[] = [
    {
      key: 'createdAtRaw',
      header: 'Data',
      mono: true,
      render: (m) => m.createdAtRaw ?? '—',
    },
    {
      key: 'type',
      header: 'Tip',
      render: (m) => (m.type ? <Badge tone="brand">{m.type}</Badge> : '—'),
    },
    { key: 'cif', header: 'CIF/CNP', mono: true },
    { key: 'details', header: 'Detalii' },
    {
      key: 'requestId',
      header: 'Solicitare',
      mono: true,
      render: (m) => m.requestId ?? '—',
    },
    {
      key: 'stored',
      header: 'Document',
      render: (m) => (
        <StatusBadge status={m.stored ? 'yes' : 'pending'}>
          {m.stored ? 'Salvat' : 'Nesalvat'}
        </StatusBadge>
      ),
    },
    {
      key: 'download',
      header: <span className="spv-sr-only">Acțiuni</span>,
      render: (m) =>
        m.stored ? (
          <Button
            size="sm"
            icon="download"
            loading={download.isPending && download.variables?.id === m.id}
            aria-label={`Descarcă mesajul ${m.anafMessageId}`}
            onClick={() => download.mutate(m)}
          >
            Descarcă
          </Button>
        ) : (
          <div className="spv-row">
            <ButtonAnchor
              size="sm"
              icon="link"
              href={`${ANAF_SPV_WEB_URL}/descarcare?id=${encodeURIComponent(m.anafMessageId)}`}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Deschide la ANAF mesajul ${m.anafMessageId}`}
            >
              Deschide la ANAF
            </ButtonAnchor>
            <UploadPdfButton
              message={m}
              loading={upload.isPending && upload.variables?.id === m.id}
              onPick={(file) => uploadPdf(m, file)}
            />
          </div>
        ),
    },
  ];

  return (
    <Card
      title="Mesaje salvate"
      subtitle="Arhiva dvs. de mesaje SPV, păstrată și după ce ANAF le elimină."
    >
      <div className="stack">
        <form className="form-row" onSubmit={submit} noValidate>
          <TextField
            label="CIF/CNP"
            mono
            value={cifInput}
            onChange={(e) => setCifInput(e.target.value)}
            inputMode="numeric"
          />
          <Button type="submit" icon="search" loading={archive.isFetching}>
            Filtrează
          </Button>
        </form>
        {error ? <Alert tone="danger" title={error} /> : null}
        {download.isError ? (
          <Alert tone="danger" title="Descărcarea a eșuat.">
            {download.error.message}
          </Alert>
        ) : null}
        {upload.isError ? (
          <Alert tone="danger" title="PDF-ul nu a fost salvat.">
            {upload.error.message}
          </Alert>
        ) : null}
        {archive.isError ? (
          <QueryError error={archive.error} retry={() => archive.refetch()} />
        ) : null}
        {archive.isPending ? (
          <div className="loading">Se încarcă…</div>
        ) : archive.data && archive.data.items.length === 0 ? (
          <EmptyState icon="invoice" title="Niciun mesaj salvat." />
        ) : archive.data ? (
          <>
            <DataTable
              caption="Mesaje SPV salvate"
              columns={columns}
              rows={archive.data.items}
              rowKey={(m) => m.id}
            />
            <div className="spv-row">
              <Button
                size="sm"
                disabled={query.page <= 1}
                onClick={() => setQuery({ ...query, page: query.page - 1 })}
              >
                Anterioare
              </Button>
              <span className="muted">
                Pagina {query.page} din {lastPage} · {total} mesaje
              </span>
              <Button
                size="sm"
                disabled={query.page >= lastPage}
                onClick={() => setQuery({ ...query, page: query.page + 1 })}
              >
                Următoarele
              </Button>
            </div>
          </>
        ) : null}
      </div>
    </Card>
  );
}

function MonthField({
  months,
  value,
  onChange,
}: {
  months?: number[];
  value: string;
  onChange: (v: string) => void;
}) {
  if (!months) {
    return (
      <TextField
        label="Luna"
        type="number"
        min={1}
        max={12}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }
  return (
    <SelectField
      id="spv-request-month"
      label="Luna"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">Alegeți luna</option>
      {months.map((m) => (
        <option key={m} value={m}>
          {m}
        </option>
      ))}
    </SelectField>
  );
}

function RequestCard({
  connectionId,
  certificates,
  onSelect,
}: {
  connectionId: number;
  certificates: Certificate[];
  onSelect: (id: number) => void;
}) {
  const create = useCreateSpvRequest();
  const [tip, setTip] = useState('');
  const [cui, setCui] = useState('');
  const [an, setAn] = useState('');
  const [luna, setLuna] = useState('');
  const [motiv, setMotiv] = useState('');
  const [numarInregistrare, setNumarInregistrare] = useState('');
  const [cuiPunctDeLucru, setCuiPunctDeLucru] = useState('');
  const [error, setError] = useState<string | null>(null);

  const type = spvRequestType(tip);
  const needs = (field: SpvRequestField) => usesField(type, field);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const form = {
      tip,
      cui: normalizeCui(cui),
      an,
      luna,
      motiv,
      numarInregistrare: numarInregistrare.trim(),
      cuiPunctDeLucru: cuiPunctDeLucru.replace(/\s+/g, ''),
    };
    const problem = spvRequestError(type, form);
    setError(problem);
    if (problem || !type) return;
    create.mutate({ connectionId, ...spvRequestPayload(type, form) });
  };

  return (
    <Card
      title="Solicită informații sau documente"
      subtitle="ANAF pregătește documentul și îl publică ulterior ca mesaj în SPV."
    >
      <form className="stack" onSubmit={submit} noValidate>
        <div className="form-row">
          <ConnectionSelect
            id="spv-request-cert"
            value={connectionId}
            onChange={onSelect}
            options={certificates}
          />
          <SelectField
            id="spv-request-type"
            label="Tip cerere"
            value={tip}
            onChange={(e) => setTip(e.target.value)}
          >
            <option value="">Alegeți tipul cererii</option>
            {SPV_REQUEST_TYPES.map((t) => (
              <option key={t.tip} value={t.tip}>
                {t.label}
              </option>
            ))}
          </SelectField>
          <TextField
            label="CUI/CNP"
            mono
            value={cui}
            onChange={(e) => setCui(e.target.value)}
            inputMode="numeric"
          />
        </div>
        {needs('an') || needs('luna') || needs('motiv') ? (
          <div className="form-row">
            {needs('an') ? (
              <TextField
                label="An"
                type="number"
                value={an}
                onChange={(e) => setAn(e.target.value)}
              />
            ) : null}
            {needs('luna') ? (
              <MonthField months={type?.months} value={luna} onChange={setLuna} />
            ) : null}
            {needs('motiv') ? (
              <SelectField
                id="spv-request-reason"
                label="Motiv"
                value={motiv}
                onChange={(e) => setMotiv(e.target.value)}
              >
                <option value="">Alegeți motivul</option>
                {SPV_INCOME_REASONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </SelectField>
            ) : null}
          </div>
        ) : null}
        {needs('numarInregistrare') || needs('cuiPunctDeLucru') ? (
          <div className="form-row">
            {needs('numarInregistrare') ? (
              <TextField
                label="Nr. înregistrare recipisă"
                mono
                value={numarInregistrare}
                onChange={(e) => setNumarInregistrare(e.target.value)}
                maxLength={50}
              />
            ) : null}
            {needs('cuiPunctDeLucru') ? (
              <TextField
                label="CUI punct de lucru (opțional)"
                mono
                value={cuiPunctDeLucru}
                onChange={(e) => setCuiPunctDeLucru(e.target.value)}
                inputMode="numeric"
              />
            ) : null}
          </div>
        ) : null}
        {error ? <Alert tone="danger" title={error} /> : null}
        {create.isError ? (
          <Alert tone="danger" title="Cererea nu a fost trimisă.">
            {create.error.message}
          </Alert>
        ) : null}
        {create.isSuccess ? (
          <Alert tone="success" title="Cererea a fost trimisă.">
            Număr solicitare:{' '}
            <span className="mono">{create.data.requestId}</span>. Răspunsul
            apare în lista de mesaje după ce ANAF îl pregătește.
          </Alert>
        ) : null}
        <div>
          <Button
            type="submit"
            variant="primary"
            icon="upload"
            loading={create.isPending}
          >
            Trimite cererea
          </Button>
        </div>
      </form>
    </Card>
  );
}

export function SpvPage() {
  const connections = useConnections();
  const usable = (connections.data ?? []).filter(
    (c) =>
      connectionStatus(c) !== 'revoked' && connectionStatus(c) !== 'expired',
  );
  const [chosen, setChosen] = useState<number | null>(null);
  const connection = usable.find((c) => c.id === chosen) ?? usable[0];

  return (
    <>
      <PageHead
        title="Mesaje SPV"
        context="Mesajele din Spațiul Privat Virtual, salvate la dvs., plus cereri de documente către ANAF."
      />
      {connections.isError ? (
        <QueryError
          error={connections.error}
          retry={() => connections.refetch()}
        />
      ) : null}
      <div className="stack">
        {connections.isSuccess && usable.length === 0 ? (
          <Alert tone="info" title="Niciun certificat activ.">
            Conectați un certificat ANAF din pagina Certificate ANAF pentru a
            trimite cereri. Mesajele deja salvate rămân disponibile.
          </Alert>
        ) : null}
        <ImportCard />
        <ArchiveCard />
        {connection ? (
          <RequestCard
            connectionId={connection.id}
            certificates={usable}
            onSelect={setChosen}
          />
        ) : null}
      </div>
    </>
  );
}
