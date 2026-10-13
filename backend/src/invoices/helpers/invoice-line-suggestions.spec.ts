import { describe, expect, it } from 'vitest';
import type { Invoice } from '../invoice.entity.js';
import type { InvoiceLine } from '../invoice.types.js';
import {
  distinctLineSuggestions,
  MAX_LINE_SUGGESTIONS,
} from './invoice-line-suggestions.js';

function invoiceLine(overrides: Partial<InvoiceLine> = {}): InvoiceLine {
  return {
    description: 'Servicii de contabilitate',
    quantity: 1,
    unit: 'serviciu',
    unitPrice: 1000,
    vatRate: 21,
    vatCategory: 'S',
    vatExemptionReason: null,
    netAmount: 1000,
    ...overrides,
  };
}

function row(
  lines: InvoiceLine[],
  overrides: Partial<Pick<Invoice, 'currency' | 'issueDate'>> = {},
): Pick<Invoice, 'lines' | 'currency' | 'issueDate'> {
  return { lines, currency: 'RON', issueDate: '2026-10-01', ...overrides };
}

describe('distinctLineSuggestions', () => {
  it('returns every line with the values needed to fill a new one', () => {
    expect(
      distinctLineSuggestions([
        row([
          invoiceLine(),
          invoiceLine({
            description: 'Chirie',
            quantity: 2,
            unit: 'luni',
            unitPrice: 500,
            vatRate: 0,
            vatCategory: 'E',
          }),
        ]),
      ]),
    ).toEqual([
      {
        description: 'Servicii de contabilitate',
        quantity: 1,
        unit: 'serviciu',
        unitPrice: 1000,
        vatRate: 21,
        vatCategory: 'S',
        currency: 'RON',
        issueDate: '2026-10-01',
      },
      {
        description: 'Chirie',
        quantity: 2,
        unit: 'luni',
        unitPrice: 500,
        vatRate: 0,
        vatCategory: 'E',
        currency: 'RON',
        issueDate: '2026-10-01',
      },
    ]);
  });

  it('keeps the most recent line when the same description repeats, ignoring case and spaces', () => {
    const result = distinctLineSuggestions([
      row([invoiceLine({ unitPrice: 1200 })], { issueDate: '2026-10-01' }),
      row([invoiceLine({ description: ' servicii DE contabilitate ', unitPrice: 900 })], {
        issueDate: '2026-09-01',
      }),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ unitPrice: 1200, issueDate: '2026-10-01' });
  });

  it('keeps the same description once per currency', () => {
    const result = distinctLineSuggestions([
      row([invoiceLine()]),
      row([invoiceLine({ unitPrice: 200 })], { currency: 'EUR' }),
    ]);
    expect(result.map((s) => s.currency)).toEqual(['RON', 'EUR']);
  });

  it('skips reversed, negative and blank lines', () => {
    expect(
      distinctLineSuggestions([
        row([
          invoiceLine({ quantity: -1 }),
          invoiceLine({ stornoOfLine: 0 }),
          invoiceLine({ description: '   ' }),
        ]),
      ]),
    ).toEqual([]);
  });

  it('stops at the maximum number of suggestions', () => {
    const lines = Array.from({ length: MAX_LINE_SUGGESTIONS + 5 }, (_, i) =>
      invoiceLine({ description: `Produs ${i}` }),
    );
    expect(distinctLineSuggestions([row(lines)])).toHaveLength(MAX_LINE_SUGGESTIONS);
  });
});
