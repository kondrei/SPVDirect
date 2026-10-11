import { line } from '../../testing/invoice-fixtures.js';
import { computeInvoice, fromCents, toCents } from './invoice-calc.js';

describe('toCents', () => {
  it('rounds half up without floating point drift', () => {
    expect(toCents(1.005)).toBe(101);
    expect(toCents(0.1 + 0.2)).toBe(30);
    expect(toCents(19.99)).toBe(1999);
  });

  it('converts back', () => {
    expect(fromCents(1999)).toBe(19.99);
  });
});

describe('computeInvoice', () => {
  it('computes the line value from quantity and unit price', () => {
    const { lines } = computeInvoice(
      [line({ quantity: 2.5, unitPrice: 19.99 })],
      null,
    );
    expect(lines[0].netAmount).toBe(49.98);
  });

  it('groups the VAT per rate and rounds once per group', () => {
    const { totals } = computeInvoice(
      [
        line({ unitPrice: 0.33, quantity: 1 }),
        line({ unitPrice: 0.33, quantity: 1 }),
        line({ unitPrice: 0.33, quantity: 1 }),
        line({ unitPrice: 100, vatRate: 11 }),
      ],
      null,
    );
    expect(totals.breakdown).toEqual([
      {
        category: 'S',
        rate: 21,
        exemptionReason: null,
        taxableAmount: 0.99,
        vatAmount: 0.21,
      },
      {
        category: 'S',
        rate: 11,
        exemptionReason: null,
        taxableAmount: 100,
        vatAmount: 11,
      },
    ]);
    expect(totals.net).toBe(100.99);
    expect(totals.vat).toBe(11.21);
    expect(totals.gross).toBe(112.2);
  });

  it('keeps exempt lines with different reasons in separate groups', () => {
    const { totals } = computeInvoice(
      [
        line({ vatRate: 0, vatCategory: 'E', vatExemptionReason: 'Scutit A' }),
        line({ vatRate: 0, vatCategory: 'E', vatExemptionReason: 'Scutit B' }),
      ],
      null,
    );
    expect(totals.breakdown).toHaveLength(2);
    expect(totals.vat).toBe(0);
    expect(totals.gross).toBe(200);
  });

  it('converts the VAT to RON with the exchange rate', () => {
    const { totals } = computeInvoice([line({ unitPrice: 1000 })], 4.9765);
    expect(totals.vat).toBe(210);
    expect(totals.vatRon).toBe(1045.07);
  });

  it('reports the VAT in RON as is for RON invoices', () => {
    const { totals } = computeInvoice([line({ unitPrice: 100 })], null);
    expect(totals.vatRon).toBe(21);
  });
});
