import { useState, type ReactNode, type SubmitEvent } from 'react';
import { Link, useSearchParams } from 'react-router';
import { EfacturaDirection } from '../../api/enums';
import { useCompanies } from '../../api/hooks/companies';
import {
  useDownloadArchiveFile,
  useEfacturaArchive,
} from '../../api/hooks/efacturaArchive';
import type { ArchiveQuery, ArchivedInvoice } from '../../api/types';
import { ARCHIVE_PAGE_SIZE } from '../../common/constants';
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
  StatusBadge,
  TextField,
  type Column,
} from '../../components/ui';
import { useAppPath } from '../../hooks/useAppPath';
import {
  archiveTitle,
  formatMoney,
  formatTaxId,
  formatTotals,
  partnerOf,
} from '../../lib/efacturaArchive';
import { formatIsoDate, pluralFacturi } from '../../lib/format';

const TABS: { value: EfacturaDirection; label: string }[] = [
  { value: EfacturaDirection.Received, label: 'Facturi primite' },
  { value: EfacturaDirection.Sent, label: 'Facturi trimise' },
];

function readQuery(params: URLSearchParams): ArchiveQuery {
  const direction =
    params.get('direction') === EfacturaDirection.Sent
      ? EfacturaDirection.Sent
      : EfacturaDirection.Received;
  const companyId = Number(params.get('companyId'));
  const page = Number(params.get('page'));
  return {
    direction,
    companyId: Number.isInteger(companyId) && companyId > 0 ? companyId : undefined,
    from: params.get('from') || undefined,
    to: params.get('to') || undefined,
    q: params.get('q') || undefined,
    page: Number.isInteger(page) && page > 0 ? page : 1,
  };
}

function writeQuery(query: ArchiveQuery): URLSearchParams {
  const params = new URLSearchParams({ direction: query.direction });
  if (query.companyId) params.set('companyId', String(query.companyId));
  if (query.from) params.set('from', query.from);
  if (query.to) params.set('to', query.to);
  if (query.q) params.set('q', query.q);
  if (query.page > 1) params.set('page', String(query.page));
  return params;
}

function ArchiveStatuses({ invoice }: Readonly<{ invoice: ArchivedInvoice }>) {
  if (!invoice.creditNote && !invoice.parseError && !invoice.invoiceId) {
    return <span className="muted">—</span>;
  }
  return (
    <span className="spv-row">
      {invoice.creditNote ? <StatusBadge status="creditNote" /> : null}
      {invoice.invoiceId ? <StatusBadge status="issuedHere" /> : null}
      {invoice.parseError ? <StatusBadge status="parseIncomplete" /> : null}
    </span>
  );
}

export function EfacturaArchivePage() {
  const appPath = useAppPath();
  const companies = useCompanies();
  const [params, setParams] = useSearchParams();
  const query = readQuery(params);
  const [search, setSearch] = useState(query.q ?? '');
  const archive = useEfacturaArchive(query);
  const download = useDownloadArchiveFile();

  const update = (change: Partial<ArchiveQuery>) =>
    setParams(writeQuery({ ...query, page: 1, ...change }));

  const submitSearch = (e: SubmitEvent) => {
    e.preventDefault();
    update({ q: search.trim() || undefined });
  };

  const total = archive.data?.total ?? 0;
  const lastPage = Math.max(1, Math.ceil(total / ARCHIVE_PAGE_SIZE));
  const received = query.direction === EfacturaDirection.Received;

  const columns: Column<ArchivedInvoice>[] = [
    {
      key: 'issueDate',
      header: 'Data emiterii',
      mono: true,
      render: (i) => (i.issueDate ? formatIsoDate(i.issueDate) : '—'),
    },
    {
      key: 'number',
      header: 'Număr',
      mono: true,
      render: (i) => (
        <Link
          to={appPath(`/efactura/archive/${i.id}`)}
          aria-label={`Deschide ${archiveTitle(i)}`}
        >
          {i.number ?? i.anafMessageId}
        </Link>
      ),
    },
    {
      key: 'partner',
      header: received ? 'Furnizor' : 'Client',
      render: (i) => {
        const partner = partnerOf(i);
        return (
          <>
            <div className="strong">{partner.name ?? '—'}</div>
            {partner.cui ? (
              <div className="muted small mono">{formatTaxId(partner.cui)}</div>
            ) : null}
          </>
        );
      },
    },
    {
      key: 'totalGross',
      header: 'Total',
      align: 'num',
      render: (i) => formatMoney(i.totalGross, i.currency),
    },
    {
      key: 'status',
      header: 'Stare',
      render: (i) => <ArchiveStatuses invoice={i} />,
    },
    {
      key: 'actions',
      header: <span className="spv-sr-only">Acțiuni</span>,
      render: (i) => (
        <div className="spv-row">
          <Button
            size="sm"
            icon="download"
            aria-label={`Descarcă PDF ${archiveTitle(i)}`}
            loading={
              download.isPending &&
              download.variables?.id === i.id &&
              download.variables.kind === 'pdf'
            }
            onClick={() => download.mutate({ id: i.id, kind: 'pdf' })}
          >
            PDF
          </Button>
          <Button
            size="sm"
            icon="download"
            aria-label={`Descarcă ZIP ${archiveTitle(i)}`}
            loading={
              download.isPending &&
              download.variables?.id === i.id &&
              download.variables.kind === 'zip'
            }
            onClick={() => download.mutate({ id: i.id, kind: 'zip' })}
          >
            ZIP
          </Button>
        </div>
      ),
    },
  ];

  let body: ReactNode = null;
  if (archive.isPending) {
    body = <div className="loading">Se încarcă…</div>;
  } else if (archive.isError) {
    body = <QueryError error={archive.error} retry={() => archive.refetch()} />;
  } else if (archive.data.items.length === 0) {
    body = (
      <EmptyState
        icon="invoice"
        title={received ? 'Nicio factură primită în arhivă.' : 'Nicio factură trimisă în arhivă.'}
        actions={
          <ButtonLink to={appPath('/efactura/messages')} variant="primary">
            Importă din mesajele e-Factura
          </ButtonLink>
        }
      >
        Alegeți firma în pagina de mesaje și importați facturile din ultimele 60
        de zile.
      </EmptyState>
    );
  } else {
    body = (
      <>
        <DataTable
          caption={received ? 'Facturi primite' : 'Facturi trimise'}
          columns={columns}
          rows={archive.data.items}
          rowKey={(i) => i.id}
          stack
        />
        {archive.data.totals.length ? (
          <p className="archive-totals">
            <span className="muted">Total în filtru:</span>{' '}
            <span className="mono strong">{formatTotals(archive.data.totals)}</span>
          </p>
        ) : null}
        <div className="spv-row">
          <Button
            size="sm"
            disabled={query.page <= 1}
            onClick={() => setParams(writeQuery({ ...query, page: query.page - 1 }))}
          >
            Anterioare
          </Button>
          <span className="muted">
            Pagina {query.page} din {lastPage} · {pluralFacturi(total)}
          </span>
          <Button
            size="sm"
            disabled={query.page >= lastPage}
            onClick={() => setParams(writeQuery({ ...query, page: query.page + 1 }))}
          >
            Următoarele
          </Button>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHead
        title="Arhivă e-Factura"
        context="Facturile importate din SPV rămân aici și după ce ANAF le șterge (60 de zile), cu fișierul original semnat."
        actions={
          <ButtonLink to={appPath('/efactura/messages')} icon="plus">
            Importă din mesaje
          </ButtonLink>
        }
      />
      <Card>
        <div className="stack">
          <div className="segmented" role="tablist" aria-label="Direcția facturilor">
            {TABS.map((tab) => (
              <button
                key={tab.value}
                type="button"
                role="tab"
                className="segmented-tab"
                aria-selected={query.direction === tab.value}
                onClick={() => update({ direction: tab.value })}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <form className="form-row" onSubmit={submitSearch}>
            <SelectField
              label="Firma"
              value={query.companyId ?? ''}
              onChange={(e) =>
                update({
                  companyId: e.target.value ? Number(e.target.value) : undefined,
                })
              }
            >
              <option value="">Toate firmele</option>
              {(companies.data ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </SelectField>
            <TextField
              label="Emise din"
              type="date"
              value={query.from ?? ''}
              onChange={(e) => update({ from: e.target.value || undefined })}
            />
            <TextField
              label="Până la"
              type="date"
              value={query.to ?? ''}
              onChange={(e) => update({ to: e.target.value || undefined })}
            />
            <TextField
              label="Caută"
              type="search"
              placeholder="Număr, partener sau CUI"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <Button type="submit" icon="search">
              Caută
            </Button>
          </form>
          {download.isError ? (
            <Alert tone="danger" title="Descărcarea a eșuat.">
              {download.error.message}
            </Alert>
          ) : null}
          {body}
        </div>
      </Card>
    </>
  );
}
