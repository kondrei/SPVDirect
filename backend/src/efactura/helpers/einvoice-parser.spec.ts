import { EfacturaStandard } from '../dto/efactura.enums.js';
import {
  BUYER_CUI,
  SELLER_CUI,
  ciiInvoice,
  ublCreditNote,
  ublInvoice,
} from '../../testing/efactura-fixtures.js';
import { normalizeTaxId, parseEinvoice } from './einvoice-parser.js';

describe('parseEinvoice', () => {
  it('reads the header, parties, totals and lines of a UBL invoice', () => {
    expect(parseEinvoice(ublInvoice())).toEqual({
      standard: EfacturaStandard.UBL,
      typeCode: '380',
      number: 'FCT-0042',
      issueDate: '2026-10-02',
      dueDate: '2026-10-30',
      currency: 'RON',
      supplier: { cui: SELLER_CUI, name: 'ALFA & FIUL SRL' },
      customer: { cui: BUYER_CUI, name: 'BETA SRL' },
      totalNet: 100,
      totalVat: 21,
      totalGross: 121,
      lines: [
        {
          name: 'Consultanță',
          quantity: 2,
          unitCode: 'H87',
          unitPrice: 50,
          vatCategory: 'S',
          vatPercent: 21,
          net: 100,
        },
      ],
      incomplete: null,
    });
  });

  it('reads a UBL credit note with its credited lines and payment due date', () => {
    const note = parseEinvoice(ublCreditNote());
    expect(note).toMatchObject({
      standard: EfacturaStandard.CN,
      typeCode: '381',
      number: 'NC-7',
      dueDate: '2026-11-05',
      totalGross: 12.1,
      totalVat: 2.1,
    });
    expect(note?.lines[0]).toMatchObject({ name: 'Retur', quantity: 1 });
  });

  it('reads a CII invoice, converting format 102 dates and picking the VAT in the invoice currency', () => {
    expect(parseEinvoice(ciiInvoice())).toMatchObject({
      standard: EfacturaStandard.CII,
      number: 'CII-9',
      issueDate: '2026-10-03',
      dueDate: '2026-11-02',
      currency: 'EUR',
      supplier: { cui: '555', name: 'GAMA SRL' },
      customer: { cui: SELLER_CUI, name: 'ALFA SRL' },
      totalNet: 200,
      totalVat: 42,
      totalGross: 242,
      lines: [expect.objectContaining({ name: 'Abonament', unitCode: 'C62' })],
      incomplete: null,
    });
  });

  it('keeps an invoice it cannot fully read and says what is missing', () => {
    const xml = ublInvoice()
      .replace('<cbc:ID>FCT-0042</cbc:ID>', '')
      .replace('<cbc:IssueDate>2026-10-02</cbc:IssueDate>', '');
    const invoice = parseEinvoice(xml);
    expect(invoice?.number).toBeNull();
    expect(invoice?.incomplete).toBe(
      'Nu s-au putut citi din factură: numărul, data emiterii',
    );
  });

  it('is not an invoice: ANAF error messages, a DOCTYPE or garbage', () => {
    expect(
      parseEinvoice(
        '<header xmlns="mfp:anaf:dgti:efactura:mesajEroriFactuta:v1"><Error errorMessage="E"/></header>',
      ),
    ).toBeNull();
    expect(
      parseEinvoice(
        '<!DOCTYPE x [<!ENTITY a "b">]><Invoice><ID>&a;</ID></Invoice>',
      ),
    ).toBeNull();
    expect(parseEinvoice('not xml at all')).toBeNull();
  });
});

describe('normalizeTaxId', () => {
  it.each([
    ['RO 123 456', '123456'],
    ['ro12345678', '12345678'],
    ['12345678', '12345678'],
    ['DE123456789', 'DE123456789'],
    ['', null],
    [null, null],
  ])('%s -> %s', (input, expected) => {
    expect(normalizeTaxId(input)).toBe(expected);
  });
});
