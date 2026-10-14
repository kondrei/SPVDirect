import { useState } from 'react';
import {
  useUploadInvoiceToAnaf,
  useValidateInvoice,
} from '../../api/hooks/efactura';
import {
  useDownloadInvoice,
  useSaveInvoiceToStorage,
} from '../../api/hooks/invoices';
import type {
  EfacturaUpload,
  Invoice,
  InvoiceSummary,
  XmlValidation,
} from '../../api/types';
import { invoiceFilename } from '../../lib/invoice';

export type ActionState<T> =
  | { status: 'pending' }
  | { status: 'success'; data: T }
  | { status: 'error'; error: Error };

export interface InvoiceActionStates {
  pdf?: ActionState<void>;
  xml?: ActionState<void>;
  store?: ActionState<Invoice>;
  anaf?: ActionState<EfacturaUpload>;
  check?: ActionState<XmlValidation>;
}

type ActionKey = keyof InvoiceActionStates;
type Downloadable = Pick<InvoiceSummary, 'id' | 'series' | 'number'>;

export function useInvoiceActions() {
  const download = useDownloadInvoice();
  const store = useSaveInvoiceToStorage();
  const toAnaf = useUploadInvoiceToAnaf();
  const check = useValidateInvoice();
  const [states, setStates] = useState<Map<number, InvoiceActionStates>>(
    () => new Map(),
  );

  const track = <K extends ActionKey>(
    id: number,
    key: K,
    run: Promise<unknown>,
  ) => {
    const set = (state: InvoiceActionStates[K]) =>
      setStates((all) => new Map(all).set(id, { ...all.get(id), [key]: state }));
    set({ status: 'pending' } as InvoiceActionStates[K]);
    run.then(
      (data) => set({ status: 'success', data } as InvoiceActionStates[K]),
      (error: Error) => set({ status: 'error', error } as InvoiceActionStates[K]),
    );
  };

  return {
    statesFor: (id: number): InvoiceActionStates => states.get(id) ?? {},
    isPending: (id: number, key: ActionKey) =>
      states.get(id)?.[key]?.status === 'pending',
    downloadPdf: (invoice: Downloadable) =>
      track(
        invoice.id,
        'pdf',
        download.mutateAsync({
          id: invoice.id,
          format: 'pdf',
          filename: invoiceFilename(invoice),
        }),
      ),
    downloadXml: (invoice: Downloadable) =>
      track(
        invoice.id,
        'xml',
        download.mutateAsync({
          id: invoice.id,
          format: 'xml',
          filename: invoiceFilename(invoice),
        }),
      ),
    saveToStorage: (id: number) => track(id, 'store', store.mutateAsync(id)),
    sendToAnaf: (id: number) => track(id, 'anaf', toAnaf.mutateAsync(id)),
    validate: (id: number) => track(id, 'check', check.mutateAsync(id)),
  };
}

export type InvoiceActions = ReturnType<typeof useInvoiceActions>;
