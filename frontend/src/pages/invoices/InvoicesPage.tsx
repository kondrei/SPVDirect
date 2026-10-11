import { Fragment, useState, type ReactNode } from 'react';
import { detailsOf } from '../../api/client';
import {
  useCompanies,
  useDownloadInvoice,
  useEfacturaUploads,
  useInvoices,
  useSaveInvoiceToStorage,
  useUploadInvoiceToAnaf,
  useValidateInvoice,
} from '../../api/hooks';
import type { EfacturaUpload, InvoiceSummary } from '../../api/types';
import { INVOICE_PAGE_SIZE } from '../../common/constants';
import { EfacturaStatusBadge } from '../../components/efactura/EfacturaStatusBadge';
import { EmptyState } from '../../components/EmptyState';
import { ErrorLog } from '../../components/ErrorLog';
import { PageHead } from '../../components/PageHead';
import { QueryError } from '../../components/QueryError';
import { SendPanel } from '../../components/invoices/SendPanel';
import { StornoPanel } from '../../components/invoices/StornoPanel';
import {
  Alert,
  Badge,
  Button,
  ButtonLink,
  Card,
  DataTable,
  type Column,
} from '../../components/ui';
import { useAppPath } from '../../hooks/useAppPath';
import {
  formatAmount,
  formatCui,
  formatDateTime,
  formatIsoDate,
  pluralFacturi,
} from '../../lib/format';
import { invoiceNumber } from '../../lib/invoice';

function filename(invoice: InvoiceSummary) {
  return `factura-${invoice.series}-${String(invoice.number).padStart(6, '0')}`;
}

export function InvoicesPage() {
  const appPath = useAppPath();
  const companies = useCompanies();
  const [companyId, setCompanyId] = useState<number | undefined>();
  const [page, setPage] = useState(1);
  const invoices = useInvoices({ companyId, page });
  const download = useDownloadInvoice();
  const store = useSaveInvoiceToStorage();
  const anafUploads = useEfacturaUploads({ companyId, page: 1, pageSize: 100 });
  const toAnaf = useUploadInvoiceToAnaf();
  const check = useValidateInvoice();
  const [sending, setSending] = useState<InvoiceSummary | null>(null);
  const [reversing, setReversing] = useState<InvoiceSummary | null>(null);

  const anafState = new Map<number, EfacturaUpload>();
  for (const u of anafUploads.data?.items ?? []) {
    if (u.invoiceId !== null && !anafState.has(u.invoiceId)) {
      anafState.set(u.invoiceId, u);
    }
  }

  const total = invoices.data?.total ?? 0;
  const lastPage = Math.max(1, Math.ceil(total / INVOICE_PAGE_SIZE));

  const columns: Column<InvoiceSummary>[] = [
    {
      key: 'number',
      header: 'Factura',
      mono: true,
      render: (i) => invoiceNumber(i.series, i.number),
    },
    ...(companyId
      ? []
      : [
          {
            key: 'seller',
            header: 'Emitent',
            render: (i: InvoiceSummary) => i.sellerName,
          },
        ]),
    {
      key: 'issueDate',
      header: 'Data',
      mono: true,
      render: (i) => formatIsoDate(i.issueDate),
    },
    {
      key: 'buyer',
      header: 'Client',
      render: (i) => (
        <>
          <div className="strong">{i.buyerName}</div>
          {i.buyerCui ? (
            <div className="muted small mono">{formatCui(i.buyerCui)}</div>
          ) : null}
        </>
      ),
    },
    {
      key: 'totalGross',
      header: 'Total',
      align: 'num',
      render: (i) => `${formatAmount(i.totalGross)} ${i.currency}`,
    },
    {
      key: 'status',
      header: 'Stare',
      render: (i) => (
        <span className="spv-row">
          {i.stored ? (
            <Badge tone="success" icon="check">
              În Storage
            </Badge>
          ) : null}
          {i.emailedAt ? (
            <Badge tone="brand" icon="check">
              Trimisă {formatDateTime(i.emailedAt)}
            </Badge>
          ) : null}
          {i.stornoOfNumber ? (
            <Badge tone="warning" icon="alert">
              Stornare {invoiceNumber(i.stornoOfSeries ?? '', i.stornoOfNumber)}
            </Badge>
          ) : null}
          {i.stornoed ? (
            <Badge tone="warning" icon="alert">
              Stornată
            </Badge>
          ) : null}
          {anafState.has(i.id) ? (
            <span className="spv-row">
              <span className="muted small">ANAF</span>
              <EfacturaStatusBadge status={anafState.get(i.id)!.status} />
            </span>
          ) : null}
          {!i.stored &&
          !i.emailedAt &&
          !i.stornoOfNumber &&
          !i.stornoed &&
          !anafState.has(i.id) ? (
            <span className="muted">—</span>
          ) : null}
        </span>
      ),
    },
  ];

  const actions = (i: InvoiceSummary) => (
    <div className="invoice-actions">
      <Button
        size="sm"
        icon="download"
        aria-label={`Descarcă PDF ${invoiceNumber(i.series, i.number)}`}
        loading={
          download.isPending &&
          download.variables?.id === i.id &&
          download.variables.format === 'pdf'
        }
        onClick={() =>
          download.mutate({ id: i.id, format: 'pdf', filename: filename(i) })
        }
      >
        PDF
      </Button>
      <Button
        size="sm"
        icon="download"
        aria-label={`Descarcă XML ${invoiceNumber(i.series, i.number)}`}
        loading={
          download.isPending &&
          download.variables?.id === i.id &&
          download.variables.format === 'xml'
        }
        onClick={() =>
          download.mutate({ id: i.id, format: 'xml', filename: filename(i) })
        }
      >
        XML
      </Button>
      <Button
        size="sm"
        aria-label={`Trimite pe email ${invoiceNumber(i.series, i.number)}`}
        onClick={() => setSending(i)}
      >
        Trimite
      </Button>
      {!['ok', 'processing'].includes(anafState.get(i.id)?.status ?? '') ? (
        <Button
          size="sm"
          aria-label={`Trimite la ANAF ${invoiceNumber(i.series, i.number)}`}
          loading={toAnaf.isPending && toAnaf.variables === i.id}
          onClick={() => toAnaf.mutate(i.id)}
        >
          e-Factura
        </Button>
      ) : null}
      <Button
        size="sm"
        aria-label={`Validează XML ${invoiceNumber(i.series, i.number)}`}
        loading={check.isPending && check.variables === i.id}
        onClick={() => check.mutate(i.id)}
      >
        Validează
      </Button>
      {!i.stornoOfNumber ? (
        <Button
          size="sm"
          aria-label={`Stornează ${invoiceNumber(i.series, i.number)}`}
          onClick={() => setReversing(i)}
        >
          Stornează
        </Button>
      ) : null}
      {!i.stored ? (
        <Button
          size="sm"
          icon="upload"
          aria-label={`Salvează în Storage ${invoiceNumber(i.series, i.number)}`}
          loading={store.isPending && store.variables === i.id}
          onClick={() => store.mutate(i.id)}
        >
          Salvează
        </Button>
      ) : null}
    </div>
  );

  const rowNote = (i: InvoiceSummary) => {
    const items: ReactNode[] = [<Fragment key="actions">{actions(i)}</Fragment>];
    if (download.isError && download.variables?.id === i.id) {
      items.push(
        <Alert key="download" tone="danger" title="Descărcarea a eșuat.">
          {download.error.message}
        </Alert>,
      );
    }
    if (store.isError && store.variables === i.id) {
      items.push(
        <Alert key="store" tone="danger" title="Factura nu a fost salvată în Storage.">
          {store.error.message}
        </Alert>,
      );
    }
    if (toAnaf.variables === i.id) {
      if (toAnaf.isError) {
        items.push(
          <Alert key="anaf" tone="danger" title="Factura nu a fost trimisă la ANAF.">
            {toAnaf.error.message}
            <ErrorLog lines={detailsOf(toAnaf.error)} />
          </Alert>,
        );
      } else if (toAnaf.isSuccess) {
        items.push(
          toAnaf.data.status === 'rejected' ? (
            <Alert key="anaf" tone="danger" title="ANAF a refuzat factura.">
              {toAnaf.data.errorMessage}
            </Alert>
          ) : (
            <Alert
              key="anaf"
              tone="success"
              title={`Factura a fost trimisă la ANAF. Index: ${toAnaf.data.uploadIndex}.`}
            >
              Starea se verifică în pagina e-Factura.
            </Alert>
          ),
        );
      }
    }
    if (check.variables === i.id) {
      if (check.isError) {
        items.push(
          <Alert key="check" tone="danger" title="Validarea nu a putut fi făcută.">
            {check.error.message}
          </Alert>,
        );
      } else if (check.isSuccess) {
        items.push(
          check.data.valid ? (
            <Alert key="check" tone="success" title="XML-ul facturii este valid pentru ANAF." />
          ) : (
            <Alert key="check" tone="danger" title="XML-ul facturii nu trece validarea ANAF.">
              <ErrorLog lines={check.data.messages} />
            </Alert>
          ),
        );
      }
    }
    if (sending?.id === i.id) {
      items.push(
        <SendPanel key="send" invoice={sending} onClose={() => setSending(null)} />,
      );
    }
    if (reversing?.id === i.id) {
      items.push(
        <StornoPanel key="storno" invoice={reversing} onClose={() => setReversing(null)} />,
      );
    }
    return <div className="stack">{items}</div>;
  };

  return (
    <>
      <PageHead
        title="Facturi"
        context="Facturi fiscale emise din firmele dvs., cu datele clientului luate de la ANAF."
        actions={
          <ButtonLink to={appPath('/invoices/new')} variant="primary" icon="plus">
            Factură nouă
          </ButtonLink>
        }
      />
      <Card>
        <div className="stack">
          <div className="form-row">
            <div className="spv-field">
              <label className="spv-field-label" htmlFor="invoice-company">
                Firma emitentă
              </label>
              <select
                id="invoice-company"
                className="spv-input"
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
              </select>
            </div>
          </div>
          {invoices.isError ? (
            <QueryError error={invoices.error} retry={() => invoices.refetch()} />
          ) : null}
          {invoices.isPending ? (
            <div className="loading">Se încarcă…</div>
          ) : invoices.data && invoices.data.items.length === 0 ? (
            <EmptyState
              icon="invoice"
              title="Nicio factură emisă."
              actions={
                <ButtonLink to={appPath('/invoices/new')} variant="primary">
                  Emite prima factură
                </ButtonLink>
              }
            >
              Alegeți firma emitentă, introduceți CUI-ul clientului și datele lui
              se completează din ANAF.
            </EmptyState>
          ) : invoices.data ? (
            <>
              <DataTable
                caption="Facturi emise"
                columns={columns}
                rows={invoices.data.items}
                rowKey={(i) => i.id}
                stack
                rowNote={rowNote}
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
                  Pagina {page} din {lastPage} · {pluralFacturi(total)}
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
    </>
  );
}
