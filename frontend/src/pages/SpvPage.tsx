import { useState, type FormEvent } from 'react';
import {
  useConnections,
  useCreateSpvRequest,
  useDownloadSpvMessage,
  useSpvArchive,
  useSyncSpv,
  type SpvArchiveQuery,
} from '../api/hooks';
import type { ArchivedSpvMessage } from '../api/types';
import { MAX_SPV_DAYS, SPV_PAGE_SIZE } from '../common/constants';
import { EmptyState } from '../components/EmptyState';
import { PageHead } from '../components/PageHead';
import { QueryError } from '../components/QueryError';
import {
  Alert,
  Badge,
  Button,
  Card,
  DataTable,
  StatusBadge,
  TextField,
  type Column,
} from '../components/ui';
import { connectionStatus, groupSerial } from '../lib/format';

export const SPV_REQUEST_TYPES = [
  'D100',
  'D101',
  'D112',
  'D112Contrib',
  'D300',
  'D390',
  'D394',
  'Istoric bilant',
  'Fisa Rol',
  'Adeverinte Venit',
  'Obligatii de plata',
];

const DIGITS = /^\d{2,13}$/;

interface Certificate {
  id: string;
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
  value: string;
  onChange: (v: string) => void;
  options: Certificate[];
}) {
  return (
    <div className="spv-field">
      <label className="spv-field-label" htmlFor={id}>
        Certificat
      </label>
      <select
        id={id}
        className="spv-input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((c) => (
          <option key={c.id} value={c.id}>
            {c.label} · {groupSerial(c.certSerial)}
          </option>
        ))}
      </select>
    </div>
  );
}

function SyncCard({
  connectionId,
  certificates,
  onSelect,
}: {
  connectionId: string;
  certificates: Certificate[];
  onSelect: (id: string) => void;
}) {
  const [zile, setZile] = useState(String(MAX_SPV_DAYS));
  const [error, setError] = useState<string | null>(null);
  const sync = useSyncSpv();

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const days = Number(zile);
    if (!Number.isInteger(days) || days < 1 || days > MAX_SPV_DAYS) {
      setError(`Introduceți un număr de zile între 1 și ${MAX_SPV_DAYS}.`);
      return;
    }
    setError(null);
    sync.mutate({ connectionId, zile: days });
  };

  return (
    <Card
      title="Sincronizare cu ANAF"
      subtitle="SPV păstrează mesajele doar o perioadă. Le salvăm aici ca să le aveți și după ce ANAF le șterge. Sincronizarea rulează și automat în fiecare noapte."
    >
      <form className="stack" onSubmit={submit} noValidate>
        <div className="form-row">
          <ConnectionSelect
            id="spv-sync-cert"
            value={connectionId}
            onChange={onSelect}
            options={certificates}
          />
          <TextField
            label="Ultimele zile"
            type="number"
            min={1}
            max={MAX_SPV_DAYS}
            value={zile}
            onChange={(e) => setZile(e.target.value)}
            hint={`Cel mult ${MAX_SPV_DAYS} de zile`}
          />
          <Button
            type="submit"
            variant="primary"
            icon="refresh"
            loading={sync.isPending}
          >
            Sincronizează din ANAF
          </Button>
        </div>
        {error ? <Alert tone="danger" title={error} /> : null}
        {sync.isError ? (
          <Alert tone="danger" title="Sincronizarea a eșuat.">
            {sync.error.message}
          </Alert>
        ) : null}
        {sync.isSuccess ? (
          <Alert
            tone={sync.data.failed > 0 ? 'warning' : 'success'}
            title="Sincronizare încheiată."
          >
            {sync.data.fetched} mesaje la ANAF, {sync.data.added} noi,{' '}
            {sync.data.downloaded} documente salvate
            {sync.data.failed > 0
              ? `, ${sync.data.failed} nereușite`
              : ''}
            {sync.data.pending > 0
              ? `. ${sync.data.pending} documente încă nesalvate: rulați din nou sincronizarea.`
              : '.'}
          </Alert>
        ) : null}
      </form>
    </Card>
  );
}

function ArchiveCard() {
  const [cifInput, setCifInput] = useState('');
  const [query, setQuery] = useState<SpvArchiveQuery>({ page: 1 });
  const [error, setError] = useState<string | null>(null);
  const archive = useSpvArchive(query);
  const download = useDownloadSpvMessage();

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
      header: <span className="spv-sr-only">Descarcă</span>,
      render: (m) => (
        <Button
          size="sm"
          icon="download"
          loading={download.isPending && download.variables?.id === m.id}
          aria-label={`Descarcă mesajul ${m.anafMessageId}`}
          onClick={() => download.mutate(m)}
        >
          Descarcă
        </Button>
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
        {archive.isError ? (
          <QueryError error={archive.error} retry={() => archive.refetch()} />
        ) : null}
        {archive.isPending ? (
          <div className="loading">Se încarcă…</div>
        ) : archive.data && archive.data.items.length === 0 ? (
          <EmptyState icon="invoice" title="Niciun mesaj salvat.">
            Rulați o sincronizare cu ANAF pentru a aduce mesajele din SPV.
          </EmptyState>
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

function RequestCard({
  connectionId,
  certificates,
  onSelect,
}: {
  connectionId: string;
  certificates: Certificate[];
  onSelect: (id: string) => void;
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

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const cleanCui = cui.replace(/\s+/g, '').replace(/^RO/i, '');
    const cleanPunct = cuiPunctDeLucru.replace(/\s+/g, '');
    if (tip.trim().length < 2) {
      setError('Alegeți sau introduceți tipul cererii.');
      return;
    }
    if (!DIGITS.test(cleanCui)) {
      setError('CUI/CNP invalid: folosiți doar cifre (2–13).');
      return;
    }
    if (cleanPunct && !DIGITS.test(cleanPunct)) {
      setError('CUI-ul punctului de lucru este invalid.');
      return;
    }
    if (an && !/^\d{4}$/.test(an)) {
      setError('Anul trebuie să aibă 4 cifre.');
      return;
    }
    if (luna && !(Number(luna) >= 1 && Number(luna) <= 12)) {
      setError('Luna trebuie să fie între 1 și 12.');
      return;
    }
    setError(null);
    create.mutate({
      connectionId,
      tip: tip.trim(),
      cui: cleanCui,
      ...(an ? { an: Number(an) } : {}),
      ...(luna ? { luna: Number(luna) } : {}),
      ...(motiv.trim() ? { motiv: motiv.trim() } : {}),
      ...(numarInregistrare.trim()
        ? { numarInregistrare: numarInregistrare.trim() }
        : {}),
      ...(cleanPunct ? { cuiPunctDeLucru: cleanPunct } : {}),
    });
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
          <TextField
            label="Tip cerere"
            list="spv-request-types"
            value={tip}
            onChange={(e) => setTip(e.target.value)}
            maxLength={100}
          />
          <datalist id="spv-request-types">
            {SPV_REQUEST_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </datalist>
          <TextField
            label="CUI/CNP"
            mono
            value={cui}
            onChange={(e) => setCui(e.target.value)}
            inputMode="numeric"
          />
        </div>
        <div className="form-row">
          <TextField
            label="An (opțional)"
            type="number"
            value={an}
            onChange={(e) => setAn(e.target.value)}
          />
          <TextField
            label="Luna (opțional)"
            type="number"
            min={1}
            max={12}
            value={luna}
            onChange={(e) => setLuna(e.target.value)}
          />
          <TextField
            label="Motiv (adeverințe de venit)"
            value={motiv}
            onChange={(e) => setMotiv(e.target.value)}
            maxLength={200}
          />
        </div>
        <div className="form-row">
          <TextField
            label="Nr. înregistrare (duplicat recipisă)"
            mono
            value={numarInregistrare}
            onChange={(e) => setNumarInregistrare(e.target.value)}
            maxLength={50}
          />
          <TextField
            label="CUI punct de lucru (fișa rol)"
            mono
            value={cuiPunctDeLucru}
            onChange={(e) => setCuiPunctDeLucru(e.target.value)}
            inputMode="numeric"
          />
        </div>
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
  const [chosen, setChosen] = useState('');
  const connectionId = usable.some((c) => c.id === chosen)
    ? chosen
    : (usable[0]?.id ?? '');

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
            sincroniza mesaje noi sau a trimite cereri. Mesajele deja salvate
            rămân disponibile.
          </Alert>
        ) : null}
        {usable.length > 0 ? (
          <SyncCard
            key={connectionId}
            connectionId={connectionId}
            certificates={usable}
            onSelect={setChosen}
          />
        ) : null}
        <ArchiveCard />
        {usable.length > 0 ? (
          <RequestCard
            connectionId={connectionId}
            certificates={usable}
            onSelect={setChosen}
          />
        ) : null}
      </div>
    </>
  );
}
