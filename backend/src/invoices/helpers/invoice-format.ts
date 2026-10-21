import type { InvoiceParty, StornoFields } from '../dto/invoice.types.js';

const numberFormat = new Intl.NumberFormat('ro-RO', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  useGrouping: true,
});

const quantityFormat = new Intl.NumberFormat('ro-RO', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 3,
});

export function formatAmount(value: number): string {
  return numberFormat.format(value);
}

export function formatQuantity(value: number): string {
  return quantityFormat.format(value);
}

export function formatIsoDate(iso: string): string {
  const [year, month, day] = iso.split('-');
  return `${day}.${month}.${year}`;
}

export function invoiceNumber(series: string, number: number): string {
  return `${series} ${String(number).padStart(6, '0')}`;
}

export function invoiceFilename(series: string, number: number): string {
  return `factura-${series}-${String(number).padStart(6, '0')}.pdf`;
}

export function vatId(party: Pick<InvoiceParty, 'cui' | 'vatPayer'>): string {
  if (!party.cui) return '';
  return party.vatPayer ? `RO${party.cui}` : party.cui;
}

const bucharestDate = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Bucharest',
});

export function bucharestToday(now: Date = new Date()): string {
  return bucharestDate.format(now);
}

export function stornoReference(invoice: StornoFields): string | null {
  if (
    !invoice.stornoOfSeries ||
    invoice.stornoOfNumber === null ||
    !invoice.stornoOfIssueDate
  ) {
    return null;
  }
  return `${invoice.stornoOfSeries} nr. ${String(invoice.stornoOfNumber).padStart(6, '0')} din ${formatIsoDate(invoice.stornoOfIssueDate)}`;
}
