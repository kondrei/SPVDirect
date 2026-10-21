import { useEffect, useId, useRef } from 'react';
import { useDownloadInvoice, useInvoicePdf } from '../../api/hooks/invoices';
import type { InvoiceSummary } from '../../api/types';
import { formatAmount, formatIsoDate } from '../../lib/format';
import { invoiceFilename, invoiceNumber } from '../../lib/invoice';
import { Alert, Button } from '../ui';

export function InvoicePreview({
  invoice,
  onClose,
}: Readonly<{
  invoice: InvoiceSummary;
  onClose: () => void;
}>) {
  const titleId = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const pdf = useInvoicePdf(invoice.id);
  const download = useDownloadInvoice();
  const number = invoiceNumber(invoice.series, invoice.number);

  useEffect(() => {
    if (!pdf.data || !frame.current) return;
    const url = URL.createObjectURL(pdf.data);
    frame.current.src = url;
    return () => URL.revokeObjectURL(url);
  }, [pdf.data]);

  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    const opener = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    if (typeof el.showModal === 'function') el.showModal();
    else el.setAttribute('open', '');
    el.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      opener?.focus();
    };
  }, [onClose]);

  return (
    <dialog
      ref={dialog}
      className="preview-dialog"
      tabIndex={-1}
      aria-labelledby={titleId}
      onCancel={(e) => e.preventDefault()}
    >
      <div className="preview-head">
        <div>
          <h2 id={titleId} className="preview-title">
            Factura {number}
          </h2>
          <div className="muted small">
            {invoice.buyerName} · {formatIsoDate(invoice.issueDate)} ·{' '}
            {formatAmount(invoice.totalGross)} {invoice.currency}
          </div>
        </div>
        <div className="spv-row">
          <Button
            size="sm"
            icon="download"
            loading={download.isPending}
            onClick={() =>
              download.mutate({
                id: invoice.id,
                format: 'pdf',
                filename: invoiceFilename(invoice),
              })
            }
          >
            Descarcă PDF
          </Button>
          <Button size="sm" icon="x" onClick={onClose}>
            Închide
          </Button>
        </div>
      </div>
      {download.isError ? (
        <Alert tone="danger" title="Descărcarea a eșuat.">
          {download.error.message}
        </Alert>
      ) : null}
      <div className="preview-body">
        {pdf.isError ? (
          <Alert tone="danger" title="Factura nu a putut fi afișată.">
            {pdf.error.message}
          </Alert>
        ) : null}
        {pdf.data && !pdf.isError ? (
          <iframe
            ref={frame}
            className="preview-frame"
            title={`Previzualizare factura ${number}`}
          />
        ) : null}
        {pdf.isError || pdf.data ? null : (
          <div className="loading">Se încarcă factura…</div>
        )}
      </div>
      <div className="muted small">
        Dacă factura nu apare (unele telefoane nu afișează PDF-uri), folosiți Descarcă PDF.
      </div>
    </dialog>
  );
}
