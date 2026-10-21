import { BadRequestException } from '@nestjs/common';
import { computeInvoice } from '../helpers/invoice-calc.js';
import { line, party, sampleInvoice } from '../../testing/invoice-fixtures.js';
import { CIUS_RO_CUSTOMIZATION_ID, renderInvoiceXml } from './invoice-xml.js';
import { VatCategory, Currency, PaymentMethod } from '../dto/invoice.enums.js';

describe('renderInvoiceXml', () => {
  const xml = renderInvoiceXml(sampleInvoice());

  it('declares the CIUS-RO customization and the UBL namespaces', () => {
    expect(xml).toContain(
      `<cbc:CustomizationID>${CIUS_RO_CUSTOMIZATION_ID}</cbc:CustomizationID>`,
    );
    expect(xml).toContain(
      'xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"',
    );
  });

  it('identifies the invoice, its dates and the type 380', () => {
    expect(xml).toContain('<cbc:ID>FCT000012</cbc:ID>');
    expect(xml).toContain('<cbc:IssueDate>2026-10-04</cbc:IssueDate>');
    expect(xml).toContain('<cbc:DueDate>2026-10-30</cbc:DueDate>');
    expect(xml).toContain('<cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>');
    expect(xml).toContain(
      '<cbc:DocumentCurrencyCode>RON</cbc:DocumentCurrencyCode>',
    );
    expect(xml).toContain(
      '<cbc:ActualDeliveryDate>2026-10-01</cbc:ActualDeliveryDate>',
    );
  });

  it('prefixes the VAT id of VAT payers with RO', () => {
    expect(xml).toContain('<cbc:CompanyID>RO12345678</cbc:CompanyID>');
    expect(xml).toContain('<cbc:CompanyID>RO87654321</cbc:CompanyID>');
  });

  it('gives the buyer a Bucharest sector as city and county RO-B', () => {
    expect(xml).toContain('<cbc:CityName>SECTOR3</cbc:CityName>');
    expect(xml).toContain('<cbc:CountrySubentity>RO-B</cbc:CountrySubentity>');
  });

  it('lists a tax subtotal per rate and the monetary totals', () => {
    expect(xml.match(/<cac:TaxSubtotal>/g)).toHaveLength(2);
    expect(xml).toContain('<cbc:Percent>21.00</cbc:Percent>');
    expect(xml).toContain('<cbc:Percent>11.00</cbc:Percent>');
    expect(xml).toContain('currencyID="RON">150.00</cbc:TaxExclusiveAmount>');
    expect(xml).toContain('currencyID="RON">176.50</cbc:PayableAmount>');
  });

  it('writes the lines with their UN/ECE unit code', () => {
    expect(xml.match(/<cac:InvoiceLine>/g)).toHaveLength(2);
    expect(xml).toContain('unitCode="C62">1</cbc:InvoicedQuantity>');
  });

  it('pays by credit transfer to the seller IBAN', () => {
    expect(xml).toContain('<cbc:PaymentMeansCode>30</cbc:PaymentMeansCode>');
    expect(xml).toContain('<cbc:ID>RO49AAAA1B31007593840000</cbc:ID>');
  });

  it('does not put the bank name in the XML, which UBL-CR-429 forbids', () => {
    const withBank = renderInvoiceXml(
      sampleInvoice({
        seller: party({ iban: 'RO49AAAA1B31007593840000', bank: 'Banca X' }),
      }),
    );
    expect(withBank).not.toContain('FinancialInstitutionBranch');
    expect(withBank).not.toContain('Banca X');
  });

  it('escapes special characters', () => {
    const out = renderInvoiceXml(
      sampleInvoice({ buyer: party({ name: 'A & B <SRL>', cui: '87654321' }) }),
    );
    expect(out).toContain('A &amp; B &lt;SRL&gt;');
    expect(out).not.toContain('A & B');
  });

  it('adds the VAT total in RON for a foreign currency', () => {
    const computed = computeInvoice([line({ unitPrice: 1000 })], 4.9765);
    const out = renderInvoiceXml(
      sampleInvoice({
        currency: Currency.EUR,
        exchangeRate: 4.9765,
        lines: computed.lines,
        vatBreakdown: computed.totals.breakdown,
        totalNet: computed.totals.net,
        totalVat: computed.totals.vat,
        totalGross: computed.totals.gross,
        totalVatRon: computed.totals.vatRon,
      }),
    );
    expect(out).toContain('<cbc:TaxCurrencyCode>RON</cbc:TaxCurrencyCode>');
    expect(out).toContain('currencyID="RON">1045.07</cbc:TaxAmount>');
  });

  it('gives exempt categories their reason and omits the seller VAT scheme for non payers', () => {
    const computed = computeInvoice(
      [
        line({
          vatRate: 0,
          vatCategory: VatCategory.NotSubject,
          vatExemptionReason: 'Neplătitor',
        }),
      ],
      null,
    );
    const out = renderInvoiceXml(
      sampleInvoice({
        seller: party({ vatPayer: false }),
        lines: computed.lines,
        vatBreakdown: computed.totals.breakdown,
        totalNet: computed.totals.net,
        totalVat: 0,
        totalGross: computed.totals.gross,
      }),
    );
    expect(out).toContain(
      '<cbc:TaxExemptionReason>Neplătitor</cbc:TaxExemptionReason>',
    );
    expect(out).toContain('<cbc:CompanyID>J35/100/2010</cbc:CompanyID>');
    expect(out).not.toContain('<cbc:CompanyID>RO12345678</cbc:CompanyID>');
  });

  it('keeps VAT ids and rates out of an invoice with out of scope lines (BR-O-02, BR-O-05)', () => {
    const computed = computeInvoice(
      [
        line({
          vatRate: 0,
          vatCategory: VatCategory.NotSubject,
          vatExemptionReason: 'Neplătitor',
        }),
      ],
      null,
    );
    const out = renderInvoiceXml(
      sampleInvoice({
        buyer: party({ cui: '87654321', vatPayer: true }),
        lines: computed.lines,
        vatBreakdown: computed.totals.breakdown,
        totalNet: computed.totals.net,
        totalVat: 0,
        totalGross: computed.totals.gross,
      }),
    );
    expect(out).not.toContain('<cac:PartyTaxScheme>');
    expect(out).not.toContain('<cbc:Percent>');
    expect(out).toContain('<cbc:CompanyID>87654321</cbc:CompanyID>');
  });

  it('adds payment terms when there is no due date (BR-CO-25)', () => {
    const out = renderInvoiceXml(sampleInvoice({ dueDate: null }));
    expect(out).not.toContain('<cbc:DueDate>');
    expect(out).toContain('<cac:PaymentTerms>');
  });

  it('omits the payment means of a transfer without an IBAN (BR-61)', () => {
    const out = renderInvoiceXml(
      sampleInvoice({
        paymentMethod: PaymentMethod.Transfer,
        seller: party({ iban: null }),
      }),
    );
    expect(out).not.toContain('<cac:PaymentMeans>');
  });

  it('notes VAT on collection', () => {
    expect(
      renderInvoiceXml(sampleInvoice({ vatOnCollection: true })),
    ).toContain('<cbc:Note>TVA la încasare</cbc:Note>');
  });

  it('refuses a buyer without CUI', () => {
    expect(() =>
      renderInvoiceXml(sampleInvoice({ buyer: party({ cui: null }) })),
    ).toThrow(BadRequestException);
  });
});
