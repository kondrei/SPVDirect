export const STATS_MONTHS = 6;

export interface StatsRow {
  issueDate: string;
  currency: string;
  exchangeRate: number | null;
  totalNet: number;
  totalVatRon: number;
  stornoOfInvoiceId: number | null;
}

export interface StatsTotals {
  invoices: number;
  stornos: number;
  netRon: number;
  vatRon: number;
  grossRon: number;
}

export interface StatsMonth {
  month: string;
  invoices: number;
  grossRon: number;
}

export interface InvoiceStats {
  month: StatsTotals;
  previousMonth: StatsTotals;
  year: StatsTotals;
  months: StatsMonth[];
}

const cents = (value: number) => Math.round(value * 100) / 100;

function shiftMonth(month: string, delta: number): string {
  const [year, number] = month.split('-').map(Number);
  const index = year * 12 + (number - 1) + delta;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`;
}

export function statsWindowStart(today: string): string {
  const month = today.slice(0, 7);
  const first = shiftMonth(month, -(STATS_MONTHS - 1));
  const yearStart = `${today.slice(0, 4)}-01`;
  return `${first < yearStart ? first : yearStart}-01`;
}

function netRon(row: StatsRow): number {
  return row.currency === 'RON'
    ? row.totalNet
    : row.totalNet * (row.exchangeRate ?? 0);
}

function totals(rows: StatsRow[]): StatsTotals {
  let net = 0;
  let vat = 0;
  for (const row of rows) {
    net += netRon(row);
    vat += row.totalVatRon;
  }
  return {
    invoices: rows.filter((r) => r.stornoOfInvoiceId === null).length,
    stornos: rows.filter((r) => r.stornoOfInvoiceId !== null).length,
    netRon: cents(net),
    vatRon: cents(vat),
    grossRon: cents(net + vat),
  };
}

export function computeInvoiceStats(
  rows: StatsRow[],
  today: string,
): InvoiceStats {
  const month = today.slice(0, 7);
  const inMonth = (m: string) => rows.filter((r) => r.issueDate.startsWith(m));
  const series = Array.from({ length: STATS_MONTHS }, (_, i) =>
    shiftMonth(month, i - (STATS_MONTHS - 1)),
  );
  return {
    month: totals(inMonth(month)),
    previousMonth: totals(inMonth(shiftMonth(month, -1))),
    year: totals(rows.filter((r) => r.issueDate.startsWith(today.slice(0, 4)))),
    months: series.map((m) => {
      const t = totals(inMonth(m));
      return { month: m, invoices: t.invoices, grossRon: t.grossRon };
    }),
  };
}
