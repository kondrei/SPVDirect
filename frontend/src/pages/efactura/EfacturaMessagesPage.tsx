import { useState } from 'react';
import { Link } from 'react-router';
import { useCompanies } from '../../api/hooks/companies';
import { useDownloadMessage, useEfacturaMessages } from '../../api/hooks/efactura';
import { useImportMessages } from '../../api/hooks/efacturaArchive';
import type {
  EfacturaMessage,
  ImportPeriodState,
  ImportResult,
} from '../../api/types';
import { MAX_IMPORT_IDS, MAX_MESSAGE_DAYS } from '../../common/constants';
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
  TextField,
  StatusBadge,
  type Column,
  type Status,
} from '../../components/ui';
import { useAppPath } from '../../hooks/useAppPath';
import {
  countImports,
  importSummary,
  isInvoiceMessage,
} from '../../lib/efacturaArchive';
import { formatDateTime } from '../../lib/format';
import { ImportStatus, MessageFilter } from '../../api/enums';
import { ImportProblems } from './ImportProblems';
import { useImportPeriod } from './useImportPeriod';

const FILTERS: { value: MessageFilter | ''; label: string }[] = [
  { value: '', label: 'Toate mesajele' },
  { value: MessageFilter.Sent, label: 'Facturi trimise' },
  { value: MessageFilter.Received, label: 'Facturi primite' },
  { value: MessageFilter.Errors, label: 'Erori de validare' },
  { value: MessageFilter.BuyerMessage, label: 'Mesaje de la cumpărător' },
];

function messageStatus(type: string): Status {
  if (/ERORI/i.test(type)) return 'messageError';
  if (/PRIMIT/i.test(type)) return 'messageReceived';
  if (/TRIMIS/i.test(type)) return 'messageSent';
  return 'messageOther';
}

function importable(message: EfacturaMessage): boolean {
  return message.archivedId === null && isInvoiceMessage(message.type);
}

function MessagesBody({
  companyId,
  messages,
  columns,
}: Readonly<{
  companyId: number | undefined;
  messages: ReturnType<typeof useEfacturaMessages>;
  columns: Column<EfacturaMessage>[];
}>) {
  if (!companyId) {
    return (
      <EmptyState icon="invoice" title="Alegeți o firmă.">
        Mesajele se citesc din ANAF cu certificatul legat de firmă.
      </EmptyState>
    );
  }
  if (messages.isPending && messages.fetchStatus !== 'idle') {
    return <div className="loading">Se încarcă…</div>;
  }
  if (messages.isError) {
    return <QueryError error={messages.error} retry={() => messages.refetch()} />;
  }
  if (!messages.data) return null;
  if (messages.data.messages.length === 0) {
    return <EmptyState icon="invoice" title="Niciun mesaj în această perioadă." />;
  }
  return (
    <DataTable
      caption="Mesaje e-Factura"
      columns={columns}
      rows={messages.data.messages}
      rowKey={(m) => m.id}
    />
  );
}

function ImportResultAlert({
  results,
  error,
}: Readonly<{ results: ImportResult[] | undefined; error: Error | null }>) {
  if (error) {
    return (
      <Alert tone="danger" title="Importul nu a pornit.">
        {error.message}
      </Alert>
    );
  }
  if (!results) return null;
  const counts = countImports(results);
  const failed = counts[ImportStatus.Failed] > 0;
  return (
    <Alert tone={failed ? 'warning' : 'success'} title={importSummary(counts)}>
      <ImportProblems problems={results} />
    </Alert>
  );
}

function PeriodImportAlert({
  state,
}: Readonly<{ state: ImportPeriodState | null }>) {
  if (!state) return null;
  const summary = importSummary(state.counts);
  return (
    <Alert
      tone={state.error ? 'danger' : 'info'}
      title={state.running ? `Se importă… ${summary}` : summary}
    >
      {state.remaining ? (
        <p>Mai sunt {state.remaining} facturi de importat; reluați importul.</p>
      ) : null}
      {state.found === 0 ? <p>Nicio factură în această perioadă.</p> : null}
      {state.error ? <p>{state.error}</p> : null}
      <ImportProblems problems={state.problems} />
    </Alert>
  );
}

function MessageActions({
  message,
  importing,
  busy,
  downloading,
  onImport,
  onDownload,
}: Readonly<{
  message: EfacturaMessage;
  importing: boolean;
  busy: boolean;
  downloading: boolean;
  onImport: () => void;
  onDownload: () => void;
}>) {
  const appPath = useAppPath();
  return (
    <div className="spv-row">
      {message.archivedId === null ? null : (
        <Link
          to={appPath(`/efactura/archive/${message.archivedId}`)}
          aria-label={`Deschide din arhivă mesajul ${message.id}`}
        >
          <StatusBadge status="archived" />
        </Link>
      )}
      {importable(message) ? (
        <Button
          size="sm"
          icon="plus"
          aria-label={`Importă mesajul ${message.id}`}
          disabled={busy}
          loading={importing}
          onClick={onImport}
        >
          Importă
        </Button>
      ) : null}
      <Button
        size="sm"
        icon="download"
        aria-label={`Descarcă mesajul ${message.id}`}
        loading={downloading}
        onClick={onDownload}
      >
        Descarcă
      </Button>
    </div>
  );
}

export function EfacturaMessagesPage() {
  const appPath = useAppPath();
  const companies = useCompanies();
  const [companyId, setCompanyId] = useState<number | undefined>();
  const [filtru, setFiltru] = useState<MessageFilter | ''>('');
  const [zile, setZile] = useState('30');
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const days = Number(zile);
  const validDays =
    Number.isInteger(days) && days >= 1 && days <= MAX_MESSAGE_DAYS;
  const messages = useEfacturaMessages({
    companyId: validDays ? companyId : undefined,
    filtru: filtru || undefined,
    zile: days,
  });
  const download = useDownloadMessage();
  const importOne = useImportMessages();
  const period = useImportPeriod();

  const eligible = (messages.data?.messages ?? []).filter((m) => importable(m));
  const chosen = eligible.filter((m) => selected.has(m.id)).map((m) => m.id);
  const allChosen = eligible.length > 0 && chosen.length === eligible.length;

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const importIds = (ids: string[]) => {
    if (!companyId || ids.length === 0) return;
    period.reset();
    importOne.mutate(
      { companyId, messageIds: ids.slice(0, MAX_IMPORT_IDS) },
      { onSuccess: () => setSelected(new Set()) },
    );
  };

  const resetFor = (change: () => void) => {
    change();
    setSelected(new Set());
    importOne.reset();
    period.reset();
  };

  const busy = importOne.isPending || period.state?.running === true;

  const columns: Column<EfacturaMessage>[] = [
    {
      key: 'select',
      header: (
        <input
          type="checkbox"
          aria-label="Alege toate facturile neimportate"
          checked={allChosen}
          disabled={eligible.length === 0}
          onChange={() =>
            setSelected(allChosen ? new Set() : new Set(eligible.map((m) => m.id)))
          }
        />
      ),
      render: (m) =>
        importable(m) ? (
          <input
            type="checkbox"
            aria-label={`Alege mesajul ${m.id}`}
            checked={selected.has(m.id)}
            onChange={() => toggle(m.id)}
          />
        ) : null,
    },
    {
      key: 'createdAt',
      header: 'Data',
      mono: true,
      render: (m) => (m.createdAt ? formatDateTime(m.createdAt) : '—'),
    },
    {
      key: 'type',
      header: 'Tip',
      render: (m) =>
        m.type ? (
          <StatusBadge status={messageStatus(m.type)}>{m.type}</StatusBadge>
        ) : (
          '—'
        ),
    },
    {
      key: 'details',
      header: 'Detalii',
      render: (m) => m.details ?? '—',
    },
    {
      key: 'ids',
      header: 'Identificatori',
      mono: true,
      render: (m) => (
        <>
          {m.id}
          {m.requestId ? (
            <div className="muted small">încărcare {m.requestId}</div>
          ) : null}
        </>
      ),
    },
    {
      key: 'actions',
      header: <span className="spv-sr-only">Acțiuni</span>,
      render: (m) => (
        <MessageActions
          message={m}
          busy={busy}
          importing={
            importOne.isPending &&
            importOne.variables?.messageIds.length === 1 &&
            importOne.variables.messageIds[0] === m.id
          }
          downloading={
            download.isPending && download.variables?.messageId === m.id
          }
          onImport={() => importIds([m.id])}
          onDownload={() =>
            companyId && download.mutate({ companyId, messageId: m.id })
          }
        />
      ),
    },
  ];

  const state = period.state;

  return (
    <>
      <PageHead
        title="Mesaje e-Factura"
        context="Facturi trimise, primite și erori de validare, direct din ANAF. ANAF păstrează mesajele 60 de zile; importați facturile ca să rămână în arhivă."
        actions={
          <>
            <ButtonLink to={appPath('/efactura/archive')}>Arhivă</ButtonLink>
            <ButtonLink to={appPath('/efactura')}>Încărcări</ButtonLink>
          </>
        }
      />
      <Card>
        <div className="stack">
          <div className="form-row">
            <SelectField
              label="Firma"
              value={companyId ?? ''}
              onChange={(e) =>
                resetFor(() =>
                  setCompanyId(e.target.value ? Number(e.target.value) : undefined),
                )
              }
            >
              <option value="">Alegeți firma</option>
              {(companies.data ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </SelectField>
            <SelectField
              label="Tip mesaje"
              value={filtru}
              onChange={(e) =>
                resetFor(() => setFiltru(e.target.value as MessageFilter | ''))
              }
            >
              {FILTERS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </SelectField>
            <TextField
              label={`Ultimele zile (1–${MAX_MESSAGE_DAYS})`}
              inputMode="numeric"
              value={zile}
              error={
                validDays
                  ? undefined
                  : `Introduceți un număr între 1 și ${MAX_MESSAGE_DAYS}`
              }
              onChange={(e) => resetFor(() => setZile(e.target.value))}
            />
          </div>
          {companyId && validDays ? (
            <div className="spv-row">
              <Button
                variant="primary"
                icon="plus"
                disabled={chosen.length === 0 || busy}
                loading={importOne.isPending && chosen.length > 1}
                onClick={() => importIds(chosen)}
              >
                Importă selectate ({chosen.length})
              </Button>
              {chosen.length > MAX_IMPORT_IDS ? (
                <span className="muted small">
                  Se importă primele {MAX_IMPORT_IDS}; reluați pentru restul.
                </span>
              ) : null}
              <Button
                icon="download"
                disabled={busy}
                loading={state?.running}
                onClick={() => {
                  importOne.reset();
                  void period.start(companyId, days);
                }}
              >
                Importă toate facturile din ultimele {days} zile
              </Button>
              {state?.running ? (
                <Button variant="ghost" onClick={period.cancel}>
                  Oprește
                </Button>
              ) : null}
            </div>
          ) : null}
          <PeriodImportAlert state={state} />
          <ImportResultAlert results={importOne.data} error={importOne.error} />
          {download.isError ? (
            <Alert tone="danger" title="Descărcarea a eșuat.">
              {download.error.message}
            </Alert>
          ) : null}
          <MessagesBody companyId={companyId} messages={messages} columns={columns} />
        </div>
      </Card>
    </>
  );
}
