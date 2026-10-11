import { useState } from 'react';
import { useCompanies, useDownloadMessage, useEfacturaMessages } from '../../api/hooks';
import type { EfacturaMessage, MessageFilter } from '../../api/types';
import { EmptyState } from '../../components/EmptyState';
import { PageHead } from '../../components/PageHead';
import { QueryError } from '../../components/QueryError';
import { SelectField } from '../../components/SelectField';
import {
  Alert,
  Badge,
  Button,
  ButtonLink,
  Card,
  DataTable,
  TextField,
  type Column,
  type Tone,
} from '../../components/ui';
import { useAppPath } from '../../hooks/useAppPath';
import { formatDateTime } from '../../lib/format';

const FILTERS: { value: MessageFilter | ''; label: string }[] = [
  { value: '', label: 'Toate mesajele' },
  { value: 'T', label: 'Facturi trimise' },
  { value: 'P', label: 'Facturi primite' },
  { value: 'E', label: 'Erori de validare' },
  { value: 'R', label: 'Mesaje de la cumpărător' },
];

function tone(type: string | null): Tone {
  if (!type) return 'neutral';
  if (/ERORI/i.test(type)) return 'danger';
  if (/PRIMIT/i.test(type)) return 'brand';
  if (/TRIMIS/i.test(type)) return 'success';
  return 'neutral';
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
        m.type ? <Badge tone={tone(m.type)}>{m.type}</Badge> : '—',
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
          {!companyId ? (
            <EmptyState icon="invoice" title="Alegeți o firmă.">
              Mesajele se citesc din ANAF cu certificatul legat de firmă.
            </EmptyState>
          ) : messages.isPending && messages.fetchStatus !== 'idle' ? (
            <div className="loading">Se încarcă…</div>
          ) : messages.isError ? (
            <QueryError error={messages.error} retry={() => messages.refetch()} />
          ) : messages.data && messages.data.messages.length === 0 ? (
            <EmptyState icon="invoice" title="Niciun mesaj în această perioadă." />
          ) : messages.data ? (
            <DataTable
              caption="Mesaje e-Factura"
              columns={columns}
              rows={messages.data.messages}
              rowKey={(m) => m.id}
            />
          ) : null}
        </div>
      </Card>
    </>
  );
}
