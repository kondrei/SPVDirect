import { useCallback, useState } from 'react';
import { useCompanies } from '../../api/hooks/companies';
import { useInvoiceUploads } from '../../api/hooks/efactura';
import { useInvoices } from '../../api/hooks/invoices';
import type { EfacturaUpload, InvoiceSummary } from '../../api/types';
import { INVOICE_PAGE_SIZE } from '../../common/constants';
import { EfacturaStatusBadge } from '../../components/efactura/EfacturaStatusBadge';
import { EmptyState } from '../../components/EmptyState';
import { PageHead } from '../../components/PageHead';
import { QueryError } from '../../components/QueryError';
import { SelectField } from '../../components/SelectField';
import {
  anafAccepted,
  InvoiceActionResults,
} from '../../components/invoices/InvoiceActionResults';
import { InvoicePreview } from '../../components/invoices/InvoicePreview';
import { SendPanel } from '../../components/invoices/SendPanel';
import { StornoPanel } from '../../components/invoices/StornoPanel';
import {
  useInvoiceActions,
  type InvoiceActions,
} from '../../components/invoices/useInvoiceActions';
import {
  Button,
  ButtonLink,
  Card,
  DataTable,
  StatusBadge,
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
import { UploadStatus } from '../../api/enums';

const SENT_TO_ANAF: EfacturaUpload['status'][] = [
  UploadStatus.Sending,
  UploadStatus.Processing,
  UploadStatus.Ok,
];

function InvoiceStatuses({
  invoice,
  upload,
}: {
  invoice: InvoiceSummary;
  upload: EfacturaUpload | undefined;
}) {
  const empty =
    !invoice.stored &&
    !invoice.emailedAt &&
    !invoice.stornoOfNumber &&
    !invoice.stornoed &&
    !upload;
  if (empty) return <span className="muted">—</span>;
  return (
    <span className="spv-row">
      {invoice.stored ? <StatusBadge status="stored" /> : null}
      {invoice.emailedAt ? (
        <StatusBadge status="emailed">
          Trimisă {formatDateTime(invoice.emailedAt)}
        </StatusBadge>
      ) : null}
      {invoice.stornoOfNumber ? (
        <StatusBadge status="storno">
          Stornare{' '}
          {invoiceNumber(invoice.stornoOfSeries ?? '', invoice.stornoOfNumber)}
        </StatusBadge>
      ) : null}
      {invoice.stornoed ? <StatusBadge status="stornoed" /> : null}
      {upload ? (
        <span className="spv-row">
          <span className="muted small">ANAF</span>
          <EfacturaStatusBadge status={upload.status} />
        </span>
      ) : null}
    </span>
  );
}

function InvoiceRowActions({
  invoice,
  upload,
  actions,
  onSend,
  onStorno,
}: {
  invoice: InvoiceSummary;
  upload: EfacturaUpload | undefined;
  actions: InvoiceActions;
  onSend: () => void;
  onStorno: () => void;
}) {
  const label = invoiceNumber(invoice.series, invoice.number);
  const sentToAnaf =
    (upload && SENT_TO_ANAF.includes(upload.status)) ||
    anafAccepted(actions.statesFor(invoice.id));
  return (
    <div className="invoice-actions">
      <Button
        size="sm"
        icon="download"
        aria-label={`Descarcă PDF ${label}`}
        loading={actions.isPending(invoice.id, 'pdf')}
        onClick={() => actions.downloadPdf(invoice)}
      >
        PDF
      </Button>
      <Button
        size="sm"
        icon="download"
        aria-label={`Descarcă XML ${label}`}
        loading={actions.isPending(invoice.id, 'xml')}
        onClick={() => actions.downloadXml(invoice)}
      >
        XML
      </Button>
      <Button size="sm" aria-label={`Trimite pe email ${label}`} onClick={onSend}>
        Trimite
      </Button>
      {sentToAnaf ? null : (
        <Button
          size="sm"
          aria-label={`Trimite la ANAF ${label}`}
          loading={actions.isPending(invoice.id, 'anaf')}
          onClick={() => actions.sendToAnaf(invoice.id)}
        >
          e-Factura
        </Button>
      )}
      <Button
        size="sm"
        aria-label={`Validează XML ${label}`}
        loading={actions.isPending(invoice.id, 'check')}
        onClick={() => actions.validate(invoice.id)}
      >
        Validează
      </Button>
      {!invoice.stornoOfNumber ? (
        <Button size="sm" aria-label={`Stornează ${label}`} onClick={onStorno}>
          Stornează
        </Button>
      ) : null}
      {!invoice.stored ? (
        <Button
          size="sm"
          icon="upload"
          aria-label={`Salvează în Storage ${label}`}
          loading={actions.isPending(invoice.id, 'store')}
          onClick={() => actions.saveToStorage(invoice.id)}
        >
          Salvează
        </Button>
      ) : null}
    </div>
  );
}

export function InvoicesPage() {
  const appPath = useAppPath();
  const companies = useCompanies();
  const [companyId, setCompanyId] = useState<number | undefined>();
  const [page, setPage] = useState(1);
  const invoices = useInvoices({ companyId, page });
  const actions = useInvoiceActions();
  const pageIds = (invoices.data?.items ?? []).map((i) => i.id);
  const uploads = useInvoiceUploads(pageIds);
  const [sending, setSending] = useState<InvoiceSummary | null>(null);
  const [reversing, setReversing] = useState<InvoiceSummary | null>(null);
  const [previewing, setPreviewing] = useState<InvoiceSummary | null>(null);
  const closePreview = useCallback(() => setPreviewing(null), []);

  const uploadOf = new Map(
    (uploads.data ?? []).map((u) => [u.invoiceId, u] as const),
  );
  const total = invoices.data?.total ?? 0;
  const lastPage = Math.max(1, Math.ceil(total / INVOICE_PAGE_SIZE));

  const columns: Column<InvoiceSummary>[] = [
    {
      key: 'number',
      header: 'Factura',
      mono: true,
      render: (i) => (
        <button
          type="button"
          className="link-button"
          aria-label={`Previzualizează ${invoiceNumber(i.series, i.number)}`}
          onClick={() => setPreviewing(i)}
        >
          {invoiceNumber(i.series, i.number)}
        </button>
      ),
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
      render: (i) => <InvoiceStatuses invoice={i} upload={uploadOf.get(i.id)} />,
    },
  ];

  const rowNote = (i: InvoiceSummary) => (
    <div className="stack">
      <InvoiceRowActions
        invoice={i}
        upload={uploadOf.get(i.id)}
        actions={actions}
        onSend={() => setSending(i)}
        onStorno={() => setReversing(i)}
      />
      <InvoiceActionResults states={actions.statesFor(i.id)} />
      {sending?.id === i.id ? (
        <SendPanel invoice={sending} onClose={() => setSending(null)} />
      ) : null}
      {reversing?.id === i.id ? (
        <StornoPanel invoice={reversing} onClose={() => setReversing(null)} />
      ) : null}
    </div>
  );

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
            <SelectField
              label="Firma emitentă"
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
                onRowClick={setPreviewing}
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
      {previewing ? <InvoicePreview invoice={previewing} onClose={closePreview} /> : null}
    </>
  );
}
