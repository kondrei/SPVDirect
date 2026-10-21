import { useState, type SubmitEvent } from 'react';
import { useSendInvoice } from '../../api/hooks/invoices';
import type { InvoiceSummary } from '../../api/types';
import { invoiceNumber } from '../../lib/invoice';
import { Alert, Button, Card, TextField } from '../ui';

export function SendPanel({
  invoice,
  defaultTo = '',
  onClose,
}: Readonly<{
  invoice: Pick<InvoiceSummary, 'id' | 'series' | 'number'>;
  defaultTo?: string;
  onClose: () => void;
}>) {
  const send = useSendInvoice();
  const [to, setTo] = useState(defaultTo);
  const submit = (e: SubmitEvent) => {
    e.preventDefault();
    send.mutate({ id: invoice.id, to: to.trim() || undefined });
  };
  return (
    <Card
      title={`Trimite factura ${invoiceNumber(invoice.series, invoice.number)}`}
      subtitle="PDF-ul facturii se trimite ca atașament."
    >
      <form className="stack" onSubmit={submit}>
        <TextField
          label="Adresa de email"
          type="email"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          hint="Lăsați gol pentru a folosi emailul cumpărătorului, dacă este salvat."
        />
        {send.isError ? (
          <Alert tone="danger" title="Emailul nu a fost trimis.">
            {send.error.message}
          </Alert>
        ) : null}
        {send.isSuccess ? (
          <Alert tone="success" title="Emailul a fost trimis." />
        ) : null}
        <div className="spv-row">
          <Button
            type="submit"
            variant="primary"
            icon="download"
            loading={send.isPending}
          >
            Trimite
          </Button>
          <Button onClick={onClose}>Închide</Button>
        </div>
      </form>
    </Card>
  );
}
