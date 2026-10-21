import {
  computeInvoiceStats,
  statsWindowStart,
  type StatsRow,
} from './invoice-stats.js';
import { Currency } from '../dto/invoice.enums.js';

function row(overrides: Partial<StatsRow> = {}): StatsRow {
  return {
    issueDate: '2026-10-02',
    currency: Currency.RON,
    exchangeRate: null,
    totalNet: 100,
    totalVatRon: 21,
    stornoOfInvoiceId: null,
    ...overrides,
  };
}

describe('statsWindowStart', () => {
  it('starts at January when the six months stay inside the year', () => {
    expect(statsWindowStart('2026-10-04')).toBe('2026-01-01');
  });

  it('reaches into the previous year early in the year', () => {
    expect(statsWindowStart('2026-02-10')).toBe('2025-09-01');
  });
});

describe('computeInvoiceStats', () => {
  it('sums the current month, the previous month and the year', () => {
    const stats = computeInvoiceStats(
      [
        row(),
        row({ issueDate: '2026-10-03', totalNet: 200, totalVatRon: 42 }),
        row({ issueDate: '2026-09-15' }),
        row({ issueDate: '2026-03-01' }),
      ],
      '2026-10-04',
    );
    expect(stats.month).toEqual({
      invoices: 2,
      stornos: 0,
      netRon: 300,
      vatRon: 63,
      grossRon: 363,
    });
    expect(stats.previousMonth.grossRon).toBe(121);
    expect(stats.year.invoices).toBe(4);
    expect(stats.year.grossRon).toBe(605);
  });

  it('nets a storno against its invoice', () => {
    const stats = computeInvoiceStats(
      [
        row(),
        row({
          totalNet: -100,
          totalVatRon: -21,
          stornoOfInvoiceId: 1,
        }),
      ],
      '2026-10-04',
    );
    expect(stats.month).toEqual({
      invoices: 1,
      stornos: 1,
      netRon: 0,
      vatRon: 0,
      grossRon: 0,
    });
  });

  it('converts foreign currency with the exchange rate', () => {
    const stats = computeInvoiceStats(
      [
        row({
          currency: Currency.EUR,
          exchangeRate: 5,
          totalNet: 100,
          totalVatRon: 105,
        }),
      ],
      '2026-10-04',
    );
    expect(stats.month.netRon).toBe(500);
    expect(stats.month.grossRon).toBe(605);
  });

  it('returns six months ending with the current one, oldest first', () => {
    const stats = computeInvoiceStats(
      [row({ issueDate: '2026-06-10' })],
      '2026-10-04',
    );
    expect(stats.months.map((m) => m.month)).toEqual([
      '2026-05',
      '2026-06',
      '2026-07',
      '2026-08',
      '2026-09',
      '2026-10',
    ]);
    expect(stats.months[1]).toEqual({
      month: '2026-06',
      invoices: 1,
      grossRon: 121,
    });
    expect(stats.months[0].invoices).toBe(0);
  });

  it('wraps the month series across a year boundary', () => {
    const stats = computeInvoiceStats([], '2026-02-10');
    expect(stats.months.map((m) => m.month)).toEqual([
      '2025-09',
      '2025-10',
      '2025-11',
      '2025-12',
      '2026-01',
      '2026-02',
    ]);
    expect(stats.previousMonth.invoices).toBe(0);
  });

  it('is all zero without invoices', () => {
    const stats = computeInvoiceStats([], '2026-10-04');
    expect(stats.year).toEqual({
      invoices: 0,
      stornos: 0,
      netRon: 0,
      vatRon: 0,
      grossRon: 0,
    });
  });
});
