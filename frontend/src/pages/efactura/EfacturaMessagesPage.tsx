import { useState } from 'react';
import { useCompanies } from '../../api/hooks/companies';
import { useDownloadMessage, useEfacturaMessages } from '../../api/hooks/efactura';
import type { EfacturaMessage } from '../../api/types';
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
import { formatDateTime } from '../../lib/format';
import { MessageFilter } from '../../api/enums';

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

export function EfacturaMessagesPage() {
  const appPath = useAppPath();
  const companies = useCompanies();
  const [companyId, setCompanyId] = useState<number | undefined>();
  const [filtru, setFiltru] = useState<MessageFilter | ''>('');
  const [zile, setZile] = useState('30');
  const days = Number(zile);
  const validDays = Number.isInteger(days) && days >= 1 && days <= 60;
  const messages = useEfacturaMessages({
    companyId: validDays ? companyId : undefined,
    filtru: filtru || undefined,
    zile: days,
  });
  const download = useDownloadMessage();

  const columns: Column<EfacturaMessage>[] = [
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
        <Button
          size="sm"
          icon="download"
          aria-label={`Descarcă mesajul ${m.id}`}
          loading={download.isPending && download.variables?.messageId === m.id}
          onClick={() =>
            companyId && download.mutate({ companyId, messageId: m.id })
          }
        >
          Descarcă
        </Button>
      ),
    },
  ];

  return (
    <>
      <PageHead
        title="Mesaje e-Factura"
        context="Facturi trimise, primite și erori de validare, direct din ANAF."
        actions={<ButtonLink to={appPath('/efactura')}>Încărcări</ButtonLink>}
      />
      <Card>
        <div className="stack">
          <div className="form-row">
            <SelectField
              label="Firma"
              value={companyId ?? ''}
              onChange={(e) =>
                setCompanyId(e.target.value ? Number(e.target.value) : undefined)
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
              onChange={(e) => setFiltru(e.target.value as MessageFilter | '')}
            >
              {FILTERS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </SelectField>
            <TextField
              label="Ultimele zile (1–60)"
              inputMode="numeric"
              value={zile}
              error={validDays ? undefined : 'Introduceți un număr între 1 și 60'}
              onChange={(e) => setZile(e.target.value)}
            />
          </div>
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
