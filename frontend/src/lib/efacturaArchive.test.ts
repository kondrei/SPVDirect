import { describe, expect, it } from 'vitest';
import { EfacturaDirection, ImportStatus } from '../api/enums';
import type { ArchivedInvoice } from '../api/types';
import {
  archiveTitle,
  countImports,
  formatMoney,
  formatTaxId,
  formatTotals,
  importSummary,
  isInvoiceMessage,
  partnerOf,
} from './efacturaArchive';

describe('isInvoiceMessage', () => {
  it('accepts received and sent invoices only', () => {
    expect(isInvoiceMessage('FACTURA PRIMITA')).toBe(true);
    expect(isInvoiceMessage(' factura trimisa ')).toBe(true);
    expect(isInvoiceMessage('ERORI FACTURA')).toBe(false);
    expect(isInvoiceMessage(null)).toBe(false);
  });
});

describe('countImports and importSummary', () => {
  it('adds a round to the running counts and says what happened', () => {
    const first = countImports([
      { messageId: '1', status: ImportStatus.Imported, id: 4 },
      { messageId: '2', status: ImportStatus.Already, id: 5 },
    ]);
    const all = countImports(
      [
        { messageId: '3', status: ImportStatus.Imported, id: 6 },
        { messageId: '4', status: ImportStatus.Failed, reason: 'ANAF' },
        { messageId: '5', status: ImportStatus.Skipped, reason: 'Nu' },
      ],
      first,
    );
    expect(all).toEqual({ imported: 2, already: 1, skipped: 1, failed: 1 });
    expect(importSummary(all)).toBe(
      '2 facturi importate · 1 era deja în arhivă · 1 mesaj sărit · 1 eroare',
    );
  });

  it('says when nothing was imported', () => {
    expect(
      importSummary({ imported: 0, already: 0, skipped: 0, failed: 0 }),
    ).toBe('0 facturi importate');
  });
});

describe('formatting', () => {
  it('shows a Romanian CUI with RO and a foreign VAT id as it is', () => {
    expect(formatTaxId('12345678')).toBe('RO 12345678');
    expect(formatTaxId('DE123456789')).toBe('DE123456789');
    expect(formatTaxId(null)).toBe('—');
  });

  it('formats amounts and the totals per currency', () => {
    expect(formatMoney(1210.5, 'RON')).toBe('1.210,50 RON');
    expect(formatMoney(null, 'RON')).toBe('—');
    expect(
      formatTotals([
        { currency: 'EUR', count: 1, total: 100 },
        { currency: 'RON', count: 2, total: -12.1 },
      ]),
    ).toBe('100,00 EUR · -12,10 RON');
  });

  it('picks the partner by direction and names credit notes', () => {
    const invoice = {
      direction: EfacturaDirection.Received,
      supplierName: 'GAMA SRL',
      supplierCui: '555',
      customerName: 'ALFA SRL',
      customerCui: '123',
      creditNote: true,
      number: 'NC-1',
      anafMessageId: '3001',
    } as ArchivedInvoice;
    expect(partnerOf(invoice)).toEqual({ name: 'GAMA SRL', cui: '555' });
    expect(
      partnerOf({ ...invoice, direction: EfacturaDirection.Sent }),
    ).toEqual({ name: 'ALFA SRL', cui: '123' });
    expect(archiveTitle(invoice)).toBe('Nota de credit NC-1');
    expect(archiveTitle({ ...invoice, creditNote: false, number: null })).toBe(
      'Factura 3001',
    );
  });
});
