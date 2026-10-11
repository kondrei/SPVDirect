import { describe, expect, it } from 'vitest';
import {
  allowedVatRates,
  computeTotals,
  invoiceNumber,
  todayIso,
} from './invoice';

describe('allowedVatRates', () => {
  it('offers 21%, 11% and 0% for deliveries from 1 August 2025', () => {
    expect(allowedVatRates('2025-08-01')).toEqual([21, 11, 0]);
  });

  it('offers the old rates before that date', () => {
    expect(allowedVatRates('2025-07-31')).toEqual([19, 9, 5, 0]);
  });
});

describe('computeTotals', () => {
  it('groups by VAT rate and rounds the VAT once per rate', () => {
    const totals = computeTotals(
      [
        { quantity: 1, unitPrice: 0.33, vatRate: 21 },
        { quantity: 1, unitPrice: 0.33, vatRate: 21 },
        { quantity: 1, unitPrice: 0.33, vatRate: 21 },
        { quantity: 1, unitPrice: 100, vatRate: 11 },
      ],
      true,
      null,
    );
    expect(totals.byRate).toEqual([
      { rate: 21, taxable: 0.99, vat: 0.21 },
      { rate: 11, taxable: 100, vat: 11 },
    ]);
    expect(totals.net).toBe(100.99);
    expect(totals.vat).toBe(11.21);
    expect(totals.gross).toBe(112.2);
  });

  it('charges no VAT when the company is not a VAT payer', () => {
    const totals = computeTotals(
      [{ quantity: 2, unitPrice: 50, vatRate: 21 }],
      false,
      null,
    );
    expect(totals).toMatchObject({ net: 100, vat: 0, gross: 100 });
  });

  it('converts the VAT to RON with the exchange rate', () => {
    const totals = computeTotals(
      [{ quantity: 1, unitPrice: 1000, vatRate: 21 }],
      true,
      4.9765,
    );
    expect(totals.vat).toBe(210);
    expect(totals.vatRon).toBe(1045.07);
  });

  it('is zero for no lines', () => {
    expect(computeTotals([], true, null)).toMatchObject({
      net: 0,
      vat: 0,
      gross: 0,
    });
  });
});

describe('invoiceNumber', () => {
  it('pads the number to six digits', () => {
    expect(invoiceNumber('FCT', 12)).toBe('FCT 000012');
  });
});

describe('todayIso', () => {
  it('uses the Bucharest calendar day', () => {
    expect(todayIso(new Date('2026-10-04T21:30:00Z'))).toBe('2026-10-05');
    expect(todayIso(new Date('2026-10-04T10:00:00Z'))).toBe('2026-10-04');
  });
});
