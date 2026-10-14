import type { InvoiceLineInput, InvoiceUnit } from '../api/types';

export const VAT_RATE_CHANGE_DATE = '2025-08-01';

export const INVOICE_UNITS: InvoiceUnit[] = [
  'buc',
  'ore',
  'zile',
  'luni',
  'kg',
  'm',
  'mp',
  'l',
  'set',
  'serviciu',
];

export const CURRENCIES = ['RON', 'EUR', 'USD', 'GBP', 'CHF'] as const;

export const PAYMENT_LABELS = {
  transfer: 'Transfer bancar',
  numerar: 'Numerar',
  card: 'Card',
} as const;

export const ZERO_VAT_REASONS = {
  E: 'Scutit de TVA (art. 292)',
  Z: 'Cotă zero de TVA',
  AE: 'Taxare inversă (art. 331)',
} as const;

export function allowedVatRates(deliveryDate: string): number[] {
  return deliveryDate >= VAT_RATE_CHANGE_DATE ? [21, 11, 0] : [19, 9, 5, 0];
}

export function toCents(amount: number): number {
  return Math.round(amount * 100 + Math.sign(amount) * 1e-7);
}

function roundHalfAway(value: number): number {
  return Math.sign(value) * Math.round(Math.abs(value));
}

export interface Totals {
  net: number;
  vat: number;
  gross: number;
  vatRon: number;
  byRate: { rate: number; taxable: number; vat: number }[];
}

export function computeTotals(
  lines: Pick<InvoiceLineInput, 'quantity' | 'unitPrice' | 'vatRate'>[],
  vatPayer: boolean,
  exchangeRate: number | null,
): Totals {
  const groups = new Map<number, number>();
  for (const line of lines) {
    const rate = vatPayer ? line.vatRate : 0;
    const net = toCents(line.quantity * line.unitPrice);
    groups.set(rate, (groups.get(rate) ?? 0) + net);
  }
  const byRate = [...groups.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([rate, taxableCents]) => ({
      rate,
      taxable: taxableCents / 100,
      vat: roundHalfAway((taxableCents * rate) / 100) / 100,
    }));
  const netCents = [...groups.values()].reduce((sum, c) => sum + c, 0);
  const vatCents = byRate.reduce((sum, r) => sum + Math.round(r.vat * 100), 0);
  return {
    net: netCents / 100,
    vat: vatCents / 100,
    gross: (netCents + vatCents) / 100,
    vatRon:
      (exchangeRate === null
        ? vatCents
        : roundHalfAway(vatCents * exchangeRate)) /
      100,
    byRate,
  };
}

export function todayIso(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Bucharest',
  }).format(now);
}

export function invoiceNumber(series: string, number: number): string {
  return `${series} ${String(number).padStart(6, '0')}`;
}

export function invoiceFilename(invoice: { series: string; number: number }): string {
  return `factura-${invoice.series}-${String(invoice.number).padStart(6, '0')}`;
}
