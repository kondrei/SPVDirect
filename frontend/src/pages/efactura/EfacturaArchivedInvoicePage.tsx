import { useState, type SubmitEvent } from 'react';
import { Link, useParams } from 'react-router';
import { EfacturaDirection } from '../../api/enums';
import {
  useArchivedInvoice,
  useDownloadArchiveFile,
  useEmailArchivedInvoice,
  usePreviewArchivePdf,
} from '../../api/hooks/efacturaArchive';
import type {
  ArchiveFileKind,
  ArchivedInvoiceDetail,
  ArchivedInvoiceLine,
} from '../../api/types';
import { PageHead } from '../../components/PageHead';
import { QueryError } from '../../components/QueryError';
import {
  Alert,
  Button,
  Card,
  DataTable,
  StatusBadge,
  TextAreaField,
  TextField,
  type Column,
} from '../../components/ui';
import { useAppPath } from '../../hooks/useAppPath';
import {
  archiveTitle,
  formatMoney,
  formatTaxId,
} from '../../lib/efacturaArchive';
import {
  decimalText,
  formatDateTime,
  formatIsoDate,
  isEmailLike,
} from '../../lib/format';

function EmailPanel({
  invoice,
  onClose,
}: Readonly<{ invoice: ArchivedInvoiceDetail; onClose: () => void }>) {
  const send = useEmailArchivedInvoice();
  const [to, setTo] = useState('');
  const [message, setMessage] = useState('');
  const [touched, setTouched] = useState(false);
  const valid = isEmailLike(to.trim());
  const submit = (e: SubmitEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!valid) return;
    send.mutate({
      id: invoice.id,
      to: to.trim(),
      message: message.trim() || undefined,
    });
  };
  return (
    <Card
      title={`Trimite ${archiveTitle(invoice).toLowerCase()}`}
      subtitle="Se atașează PDF-ul și arhiva ZIP originală de la ANAF (XML și semnătură)."
    >
      <form className="stack" onSubmit={submit} noValidate>
        <TextField
          label="Adresa de email"
          type="email"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          error={touched && !valid ? 'Introduceți o adresă de email validă.' : undefined}
        />
        <TextAreaField
          label="Mesaj (opțional)"
          value={message}
          maxLength={2000}
          onChange={(e) => setMessage(e.target.value)}
        />
        {send.isError ? (
          <Alert tone="danger" title="Emailul nu a fost trimis.">
            {send.error.message}
          </Alert>
        ) : null}
        {send.isSuccess ? (
          <Alert tone="success" title={`Emailul a fost trimis la ${send.data.to}.`}>
            {send.data.withPdf
              ? null
              : 'PDF-ul nu a putut fi generat la ANAF, așa că s-a trimis doar arhiva ZIP.'}
          </Alert>
        ) : null}
        <div className="spv-row">
          <Button type="submit" variant="primary" loading={send.isPending}>
            Trimite
          </Button>
          <Button onClick={onClose}>Închide</Button>
        </div>
      </form>
    </Card>
  );
}

const LINE_COLUMNS: Column<ArchivedInvoiceLine>[] = [
  { key: 'name', header: 'Denumire', render: (l) => l.name ?? '—' },
  {
    key: 'quantity',
    header: 'Cantitate',
    align: 'num',
    render: (l) =>
      l.quantity === null
        ? '—'
        : [decimalText(l.quantity), l.unitCode].filter(Boolean).join(' '),
  },
  {
    key: 'unitPrice',
    header: 'Preț unitar',
    align: 'num',
    render: (l) => (l.unitPrice === null ? '—' : decimalText(l.unitPrice)),
  },
  {
    key: 'vat',
    header: 'TVA',
    align: 'num',
    render: (l) => {
      if (l.vatPercent === null) return l.vatCategory ?? '—';
      return `${decimalText(l.vatPercent)}%`;
    },
  },
  {
    key: 'net',
    header: 'Valoare',
    align: 'num',
    render: (l) => formatMoney(l.net, null),
  },
];

function Party({
  title,
  name,
  cui,
}: Readonly<{ title: string; name: string | null; cui: string | null }>) {
  return (
    <Card title={title}>
      <dl className="dl">
        <dt>Denumire</dt>
        <dd>{name ?? '—'}</dd>
        <dt>CUI</dt>
        <dd className="mono">{formatTaxId(cui)}</dd>
      </dl>
    </Card>
  );
}

function InvoiceView({ invoice }: Readonly<{ invoice: ArchivedInvoiceDetail }>) {
  const appPath = useAppPath();
  const download = useDownloadArchiveFile();
  const preview = usePreviewArchivePdf();
  const [emailing, setEmailing] = useState(false);
  const received = invoice.direction === EfacturaDirection.Received;

  const fileButton = (kind: ArchiveFileKind, label: string) => (
    <Button
      icon="download"
      loading={download.isPending && download.variables?.kind === kind}
      onClick={() => download.mutate({ id: invoice.id, kind })}
    >
      {label}
    </Button>
  );

  return (
    <>
      <PageHead
        crumbs={
          <>
            <Link to={appPath(`/efactura/archive?direction=${invoice.direction}`)}>
              Arhivă e-Factura
            </Link>{' '}
            › {invoice.number ?? invoice.anafMessageId}
          </>
        }
        title={archiveTitle(invoice)}
        context={
          <span className="spv-row">
            <StatusBadge status={received ? 'messageReceived' : 'messageSent'} />
            {invoice.creditNote ? <StatusBadge status="creditNote" /> : null}
            {invoice.issueDate ? (
              <span className="mono">{formatIsoDate(invoice.issueDate)}</span>
            ) : null}
          </span>
        }
        actions={
          <>
            <Button
              variant="primary"
              onClick={() =>
                preview.mutate({
                  id: invoice.id,
                  target: window.open('', '_blank'),
                })
              }
              loading={preview.isPending}
            >
              Previzualizează PDF
            </Button>
            <Button onClick={() => setEmailing(true)}>Trimite pe email</Button>
          </>
        }
      />
      <div className="stack">
        {invoice.parseError ? (
          <Alert tone="warning" title="Factura nu a putut fi citită complet.">
            {invoice.parseError}. Fișierul original de la ANAF este păstrat și
            poate fi descărcat.
          </Alert>
        ) : null}
        {invoice.invoiceId ? (
          <Alert tone="info" title="Factura a fost emisă din SPVDirect.">
            <Link to={appPath('/invoices')}>Vezi lista de facturi emise</Link>
          </Alert>
        ) : null}
        {preview.isError || download.isError ? (
          <Alert tone="danger" title="Fișierul nu a putut fi deschis.">
            {(preview.error ?? download.error)?.message}
          </Alert>
        ) : null}
        <div className="spv-row">
          {fileButton('pdf', 'Descarcă PDF')}
          {fileButton('xml', 'Descarcă XML')}
          {fileButton('zip', 'ZIP original ANAF')}
        </div>
        {emailing ? (
          <EmailPanel invoice={invoice} onClose={() => setEmailing(false)} />
        ) : null}
        <div className="grid-1-1">
          <Party
            title="Furnizor"
            name={invoice.supplierName}
            cui={invoice.supplierCui}
          />
          <Party
            title="Cumpărător"
            name={invoice.customerName}
            cui={invoice.customerCui}
          />
        </div>
        <div className="grid-1-1">
          <Card title="Valori">
            <dl className="dl">
              <dt>Total fără TVA</dt>
              <dd className="mono">{formatMoney(invoice.totalNet, invoice.currency)}</dd>
              <dt>TVA</dt>
              <dd className="mono">{formatMoney(invoice.totalVat, invoice.currency)}</dd>
              <dt>Total</dt>
              <dd className="mono strong">
                {formatMoney(invoice.totalGross, invoice.currency)}
              </dd>
              <dt>Scadență</dt>
              <dd className="mono">
                {invoice.dueDate ? formatIsoDate(invoice.dueDate) : '—'}
              </dd>
            </dl>
          </Card>
          <Card title="ANAF">
            <dl className="dl">
              <dt>Mesaj</dt>
              <dd className="mono">{invoice.anafMessageId}</dd>
              <dt>Index încărcare</dt>
              <dd className="mono">{invoice.uploadIndex ?? '—'}</dd>
              <dt>Standard</dt>
              <dd className="mono">{invoice.standard}</dd>
              <dt>Mediu</dt>
              <dd className="mono">{invoice.environment}</dd>
              <dt>Importată</dt>
              <dd className="mono">{formatDateTime(invoice.createdAt)}</dd>
            </dl>
          </Card>
        </div>
        <Card title="Linii" flush>
          {invoice.lines.length ? (
            <DataTable
              caption="Liniile facturii"
              columns={LINE_COLUMNS}
              rows={invoice.lines}
              rowKey={(l) => invoice.lines.indexOf(l)}
              stack
            />
          ) : (
            <p className="muted">Factura nu are linii citite.</p>
          )}
        </Card>
      </div>
    </>
  );
}

export function EfacturaArchivedInvoicePage() {
  const { archiveId } = useParams();
  const id = Number(archiveId);
  const valid = Number.isInteger(id) && id > 0;
  const invoice = useArchivedInvoice(valid ? id : undefined);
  if (!valid) {
    return <Alert tone="danger" title="Factura nu a fost găsită în arhivă." />;
  }
  if (invoice.isPending) return <div className="loading">Se încarcă…</div>;
  if (invoice.isError) {
    return <QueryError error={invoice.error} retry={() => invoice.refetch()} />;
  }
  return <InvoiceView invoice={invoice.data} />;
}
