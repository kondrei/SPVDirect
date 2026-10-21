import type { ReactNode } from 'react';
import { detailsOf } from '../../api/client';
import type { CreatedInvoice } from '../../api/types';
import { ErrorLog } from '../ErrorLog';
import { Alert } from '../ui';
import type { InvoiceActionStates } from './useInvoiceActions';
import { UploadStatus } from '../../api/enums';

export function InvoiceActionResults({
  states,
}: {
  states: InvoiceActionStates;
}) {
  const items: ReactNode[] = [];
  for (const key of ['pdf', 'xml'] as const) {
    const state = states[key];
    if (state?.status === 'error') {
      items.push(
        <Alert key={key} tone="danger" title="Descărcarea a eșuat.">
          {state.error.message}
        </Alert>,
      );
    }
  }
  if (states.store?.status === 'error') {
    items.push(
      <Alert key="store" tone="danger" title="Factura nu a fost salvată în Storage.">
        {states.store.error.message}
      </Alert>,
    );
  } else if (states.store?.status === 'success') {
    items.push(
      <Alert key="store" tone="success" title="PDF-ul a fost salvat în Storage." />,
    );
  }
  if (states.anaf?.status === 'error') {
    items.push(
      <Alert key="anaf" tone="danger" title="Factura nu a fost trimisă la ANAF.">
        {states.anaf.error.message}
        <ErrorLog lines={detailsOf(states.anaf.error)} />
      </Alert>,
    );
  } else if (states.anaf?.status === 'success') {
    const upload = states.anaf.data;
    items.push(
      upload.status === UploadStatus.Rejected ? (
        <Alert key="anaf" tone="danger" title="ANAF a refuzat factura.">
          {upload.errorMessage}
        </Alert>
      ) : (
        <Alert
          key="anaf"
          tone="success"
          title={`Factura a fost trimisă la ANAF. Index: ${upload.uploadIndex}.`}
        >
          Starea se verifică în pagina e-Factura.
        </Alert>
      ),
    );
  }
  if (states.check?.status === 'error') {
    items.push(
      <Alert key="check" tone="danger" title="Validarea nu a putut fi făcută.">
        {states.check.error.message}
      </Alert>,
    );
  } else if (states.check?.status === 'success') {
    items.push(
      states.check.data.valid ? (
        <Alert key="check" tone="success" title="XML-ul facturii este valid pentru ANAF." />
      ) : (
        <Alert key="check" tone="danger" title="XML-ul facturii nu trece validarea ANAF.">
          <ErrorLog lines={states.check.data.messages} />
        </Alert>
      ),
    );
  }
  return <>{items}</>;
}

export function DeliveryResults({ result }: { result: CreatedInvoice }) {
  const { invoice } = result;
  return (
    <>
      {invoice.storagePath ? (
        <Alert tone="success" title="PDF-ul a fost salvat în Storage." />
      ) : null}
      {invoice.emailedTo ? (
        <Alert tone="success" title={`Emailul a fost trimis la ${invoice.emailedTo}.`} />
      ) : null}
      {result.storageError ? (
        <Alert tone="warning" title="Salvarea în Storage a eșuat.">
          {result.storageError}
        </Alert>
      ) : null}
      {result.emailError ? (
        <Alert tone="warning" title="Emailul nu a fost trimis.">
          {result.emailError}
        </Alert>
      ) : null}
    </>
  );
}

export function anafAccepted(states: InvoiceActionStates): boolean {
  return (
    states.anaf?.status === 'success' && states.anaf.data.status !== UploadStatus.Rejected
  );
}
