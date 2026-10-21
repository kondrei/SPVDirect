import { EfacturaDirection, ImportStatus } from '../api/enums';
import type {
  ArchiveTotal,
  ArchivedInvoice,
  ImportCounts,
  ImportResult,
} from '../api/types';
import { formatAmount, formatCui, plural } from './format';

export function isInvoiceMessage(type: string | null): boolean {
  return /^FACTURA (PRIMITA|TRIMISA)$/i.test(type?.trim() ?? '');
}

export function emptyCounts(): ImportCounts {
  return {
    [ImportStatus.Imported]: 0,
    [ImportStatus.Already]: 0,
    [ImportStatus.Skipped]: 0,
    [ImportStatus.Failed]: 0,
  };
}

export function countImports(
  results: ImportResult[],
  start: ImportCounts = emptyCounts(),
): ImportCounts {
  const counts = { ...start };
  for (const result of results) counts[result.status]++;
  return counts;
}

export function importSummary(counts: ImportCounts): string {
  const parts = [
    plural(counts[ImportStatus.Imported], 'factură importată', 'facturi importate'),
  ];
  if (counts[ImportStatus.Already]) {
    parts.push(plural(counts[ImportStatus.Already], 'era deja în arhivă', 'erau deja în arhivă'));
  }
  if (counts[ImportStatus.Skipped]) {
    parts.push(plural(counts[ImportStatus.Skipped], 'mesaj sărit', 'mesaje sărite'));
  }
  if (counts[ImportStatus.Failed]) {
    parts.push(plural(counts[ImportStatus.Failed], 'eroare', 'erori'));
  }
  return parts.join(' · ');
}

export function formatTaxId(cui: string | null): string {
  if (!cui) return '—';
  return /^\d+$/.test(cui) ? formatCui(cui) : cui;
}

export function partnerOf(invoice: ArchivedInvoice): {
  name: string | null;
  cui: string | null;
} {
  return invoice.direction === EfacturaDirection.Received
    ? { name: invoice.supplierName, cui: invoice.supplierCui }
    : { name: invoice.customerName, cui: invoice.customerCui };
}

export function formatMoney(
  value: number | null,
  currency: string | null,
): string {
  if (value === null) return '—';
  return `${formatAmount(value)} ${currency ?? ''}`.trim();
}

export function formatTotals(totals: ArchiveTotal[]): string {
  return totals.map((t) => formatMoney(t.total, t.currency)).join(' · ');
}

export function archiveTitle(invoice: ArchivedInvoice): string {
  const what = invoice.creditNote ? 'Nota de credit' : 'Factura';
  return `${what} ${invoice.number ?? invoice.anafMessageId}`;
}
