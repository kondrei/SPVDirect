import { useState } from 'react';
import type { CreatedInvoice } from '../../api/types';
import { PageHead } from '../../components/PageHead';
import {
  anafAccepted,
  DeliveryResults,
  InvoiceActionResults,
} from '../../components/invoices/InvoiceActionResults';
import { SendPanel } from '../../components/invoices/SendPanel';
import { StornoPanel } from '../../components/invoices/StornoPanel';
import { useInvoiceActions } from '../../components/invoices/useInvoiceActions';
import { Alert, Button, ButtonLink, Card } from '../../components/ui';
import { useAppPath } from '../../hooks/useAppPath';
import { formatAmount } from '../../lib/format';
import { invoiceNumber } from '../../lib/invoice';

export function InvoiceCreated({
  result,
  onAnother,
}: {
  result: CreatedInvoice;
  onAnother: () => void;
}) {
  const appPath = useAppPath();
  const actions = useInvoiceActions();
  const [panel, setPanel] = useState<'send' | 'storno' | null>(null);
  const { invoice } = result;
  const states = actions.statesFor(invoice.id);
  const number = invoiceNumber(invoice.series, invoice.number);
  const stored = !!invoice.storagePath || states.store?.status === 'success';
  return (
    <>
      <PageHead title="Factura a fost emisă" context={number} />
      <Card>
        <div className="stack">
          <Alert tone="success" title={`Factura ${number} a fost creată.`}>
            Total de plată: {formatAmount(invoice.totalGross)} {invoice.currency}.
          </Alert>
          <DeliveryResults result={result} />
          <InvoiceActionResults states={states} />
          <div className="action-grid">
            <Button
              variant="primary"
              icon="download"
              loading={actions.isPending(invoice.id, 'pdf')}
              onClick={() => actions.downloadPdf(invoice)}
            >
              Descarcă PDF
            </Button>
            <Button
              icon="download"
              loading={actions.isPending(invoice.id, 'xml')}
              onClick={() => actions.downloadXml(invoice)}
            >
              Descarcă XML e-Factura
            </Button>
            <Button
              loading={actions.isPending(invoice.id, 'check')}
              onClick={() => actions.validate(invoice.id)}
            >
              Validează XML
            </Button>
            {anafAccepted(states) ? null : (
              <Button
                icon="upload"
                loading={actions.isPending(invoice.id, 'anaf')}
                onClick={() => actions.sendToAnaf(invoice.id)}
              >
                Trimite la ANAF
              </Button>
            )}
            <Button onClick={() => setPanel(panel === 'send' ? null : 'send')}>
              Trimite pe email
            </Button>
            {stored ? null : (
              <Button
                icon="upload"
                loading={actions.isPending(invoice.id, 'store')}
                onClick={() => actions.saveToStorage(invoice.id)}
              >
                Salvează în Storage
              </Button>
            )}
            <Button onClick={() => setPanel(panel === 'storno' ? null : 'storno')}>
              Stornează
            </Button>
          </div>
          <hr className="separator" />
          <div className="spv-row">
            <Button onClick={onAnother}>Factură nouă</Button>
            <ButtonLink to={appPath('/invoices')}>Înapoi la facturi</ButtonLink>
          </div>
        </div>
      </Card>
      {panel === 'send' ? (
        <SendPanel
          invoice={invoice}
          defaultTo={invoice.emailedTo ?? invoice.buyer.email ?? ''}
          onClose={() => setPanel(null)}
        />
      ) : null}
      {panel === 'storno' ? (
        <StornoPanel invoice={invoice} onClose={() => setPanel(null)} />
      ) : null}
    </>
  );
}
