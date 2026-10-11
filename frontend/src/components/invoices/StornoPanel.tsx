import { useState, type FormEvent } from 'react';
import {
  useCreateStorno,
  useDownloadInvoice,
  useInvoice,
} from '../../api/hooks';
import type { InvoiceSummary } from '../../api/types';
import { formatAmount } from '../../lib/format';
import { invoiceNumber, todayIso } from '../../lib/invoice';
import { QueryError } from '../QueryError';
import { Alert, Button, Card, TextAreaField, TextField } from '../ui';

function filename(series: string, number: number) {
  return `factura-${series}-${String(number).padStart(6, '0')}`;
}

function parseQuantity(value: string): number {
  const text = value.trim().replace(',', '.');
  return text === '' ? 0 : Number(text);
}

function StornoForm({
  invoice,
  lines,
  remaining,
  onClose,
}: {
  invoice: Pick<InvoiceSummary, 'id' | 'series' | 'number' | 'issueDate'>;
  lines: { description: string; unit: string }[];
  remaining: number[];
  onClose: () => void;
}) {
  const create = useCreateStorno();
  const download = useDownloadInvoice();
  const [quantities, setQuantities] = useState(remaining.map(String));
  const [issueDate, setIssueDate] = useState(todayIso());
  const [series, setSeries] = useState(invoice.series);
  const [notes, setNotes] = useState('');
  const [saveToStorage, setSaveToStorage] = useState(false);
  const [sendEmail, setSendEmail] = useState(false);
  const [emailTo, setEmailTo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const label = invoiceNumber(invoice.series, invoice.number);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const chosen = quantities
      .map((q, lineIndex) => ({ lineIndex, quantity: parseQuantity(q) }))
      .filter((l) => l.quantity !== 0);
    const bad = chosen.find(
      (l) =>
        !(l.quantity > 0) ||
        Math.round(l.quantity * 1000) > Math.round(remaining[l.lineIndex] * 1000),
    );
    if (chosen.length === 0) {
      setError('Alegeți cel puțin o linie de stornat.');
      return;
    }
    if (bad) {
      setError(
        `Linia ${bad.lineIndex + 1}: cantitatea trebuie să fie între 0 și ${remaining[bad.lineIndex]}.`,
      );
      return;
    }
    if (!issueDate || issueDate < invoice.issueDate) {
      setError('Data stornării nu poate fi înaintea facturii stornate.');
      return;
    }
    if (!/^[A-Za-z0-9]{1,10}$/.test(series.trim())) {
      setError('Seria poate avea 1–10 litere sau cifre.');
      return;
    }
    if (sendEmail && !/^\S+@\S+\.\S+$/.test(emailTo.trim())) {
      setError('Introduceți adresa de email la care se trimite factura.');
      return;
    }
    setError(null);
    create.mutate({
      id: invoice.id,
      issueDate,
      series: series.trim().toUpperCase(),
      notes: notes.trim() || null,
      lines: chosen,
      saveToStorage,
      sendToEmail: sendEmail ? emailTo.trim() : null,
    });
  };

  if (create.isSuccess) {
    const created = create.data.invoice;
    const name = filename(created.series, created.number);
    const createdLabel = invoiceNumber(created.series, created.number);
    return (
      <Card title={`Factura ${label} a fost stornată`}>
        <div className="stack">
          <Alert
            tone="success"
            title={`Factura de stornare ${createdLabel} a fost creată.`}
          >
            Total: {formatAmount(created.totalGross)} {created.currency}.
          </Alert>
          {created.emailedTo ? (
            <Alert
              tone="success"
              title={`Emailul a fost trimis la ${created.emailedTo}.`}
            />
          ) : null}
          {create.data.storageError ? (
            <Alert tone="warning" title="Salvarea în Storage a eșuat.">
              {create.data.storageError}
            </Alert>
          ) : null}
          {create.data.emailError ? (
            <Alert tone="warning" title="Emailul nu a fost trimis.">
              {create.data.emailError}
            </Alert>
          ) : null}
          {download.isError ? (
            <Alert tone="danger" title="Descărcarea a eșuat.">
              {download.error.message}
            </Alert>
          ) : null}
          <div className="spv-row">
            <Button
              variant="primary"
              icon="download"
              onClick={() =>
                download.mutate({ id: created.id, format: 'pdf', filename: name })
              }
            >
              Descarcă PDF
            </Button>
            <Button
              icon="download"
              onClick={() =>
                download.mutate({ id: created.id, format: 'xml', filename: name })
              }
            >
              Descarcă XML
            </Button>
            <Button onClick={onClose}>Închide</Button>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card
      title={`Stornează factura ${label}`}
      subtitle="Se emite o factură nouă, cu valori negative, care face referire la factura inițială. Factura inițială rămâne neschimbată."
    >
      <form className="stack" onSubmit={submit} noValidate>
        {lines.map((line, index) => (
          <div key={index} className="form-row">
            <div className="spv-field">
              <span className="spv-field-label">{`Linia ${index + 1}`}</span>
              <div>{line.description}</div>
            </div>
            <TextField
              label={`Cantitate de stornat (${line.unit}) · rămas ${remaining[index]}`}
              mono
              inputMode="decimal"
              value={quantities[index]}
              disabled={remaining[index] <= 0}
              onChange={(e) =>
                setQuantities((all) =>
                  all.map((q, i) => (i === index ? e.target.value : q)),
                )
              }
            />
          </div>
        ))}
        <div className="form-row">
          <TextField
            label="Data stornării"
            type="date"
            value={issueDate}
            onChange={(e) => setIssueDate(e.target.value)}
          />
          <TextField
            label="Seria"
            mono
            maxLength={10}
            value={series}
            onChange={(e) => setSeries(e.target.value)}
          />
        </div>
        <TextAreaField
          label="Mențiuni (motivul stornării)"
          rows={2}
          maxLength={500}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
        <label className="check">
          <input
            type="checkbox"
            checked={saveToStorage}
            onChange={(e) => setSaveToStorage(e.target.checked)}
          />
          Salvează PDF-ul în Supabase Storage
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={sendEmail}
            onChange={(e) => setSendEmail(e.target.checked)}
          />
          Trimite factura de stornare pe email
        </label>
        {sendEmail ? (
          <TextField
            label="Trimite la"
            type="email"
            value={emailTo}
            onChange={(e) => setEmailTo(e.target.value)}
          />
        ) : null}
        {error ? <Alert tone="danger" title={error} /> : null}
        {create.isError ? (
          <Alert tone="danger" title="Factura de stornare nu a fost emisă.">
            {create.error.message}
          </Alert>
        ) : null}
        <div className="spv-row">
          <Button
            type="submit"
            variant="danger"
            loading={create.isPending}
            disabled={remaining.every((q) => q <= 0)}
          >
            Emite factura de stornare
          </Button>
          <Button onClick={onClose}>Renunță</Button>
        </div>
      </form>
    </Card>
  );
}

export function StornoPanel({
  invoice,
  onClose,
}: {
  invoice: Pick<InvoiceSummary, 'id' | 'series' | 'number' | 'issueDate'>;
  onClose: () => void;
}) {
  const detail = useInvoice(invoice.id);
  if (detail.isPending) return <div className="loading">Se încarcă…</div>;
  if (detail.isError) {
    return <QueryError error={detail.error} retry={() => detail.refetch()} />;
  }
  const remaining =
    detail.data.remainingQuantities ?? detail.data.lines.map(() => 0);
  return (
    <>
      {remaining.every((q) => q <= 0) ? (
        <Alert tone="info" title="Factura a fost deja stornată integral." />
      ) : null}
      <StornoForm
        invoice={invoice}
        lines={detail.data.lines}
        remaining={remaining}
        onClose={onClose}
      />
    </>
  );
}
