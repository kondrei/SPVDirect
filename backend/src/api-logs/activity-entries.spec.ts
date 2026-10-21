import {
  UploadStatus,
  ValidateStandard,
} from '../efactura/dto/efactura.enums.js';
import type { Invoice } from '../invoices/invoice.entity.js';
import {
  companyUpdated,
  efacturaMessagesLoaded,
  efacturaUploaded,
  efacturaValidated,
  invoiceIssued,
  spvImported,
} from './activity-entries.js';
import { ActivityAction } from './dto/api-log.enums.js';

const COMPANY = { id: 7, name: 'ALFA SRL', cui: '123' };

const INVOICE_FIELDS = {
  id: 9,
  companyId: 7,
  series: 'FCT',
  number: 12,
  buyer: { name: 'BETA SRL', cui: '456' },
  totalGross: 1210,
  currency: 'RON',
  stornoOfSeries: null,
  stornoOfNumber: null,
  stornoOfIssueDate: null,
};

const INVOICE = INVOICE_FIELDS as unknown as Invoice;

describe('activity entries', () => {
  it('describes an issued invoice with its number, buyer and total', () => {
    expect(invoiceIssued(INVOICE, { emailedTo: null, stored: true })).toEqual({
      action: ActivityAction.InvoiceIssued,
      companyId: 7,
      description:
        'Factura FCT 000012 a fost emisă către BETA SRL: 1.210,00 RON',
      details: {
        invoiceId: 9,
        invoiceNumber: 'FCT 000012',
        buyerName: 'BETA SRL',
        buyerCui: '456',
        total: 1210,
        currency: 'RON',
        stornoOf: null,
        emailedTo: null,
        stored: true,
      },
    });
  });

  it('logs a storno invoice as a storno of the original', () => {
    const entry = invoiceIssued(
      {
        ...INVOICE_FIELDS,
        number: 13,
        totalGross: -1210,
        stornoOfSeries: 'FCT',
        stornoOfNumber: 12,
        stornoOfIssueDate: '2026-10-01',
      } as unknown as Invoice,
      { emailedTo: 'a@b.ro', stored: false },
    );
    expect(entry.action).toBe(ActivityAction.InvoiceStorno);
    expect(entry.description).toBe(
      'Factura de stornare FCT 000013 a fost emisă pentru factura FCT nr. 000012 din 01.10.2026, către BETA SRL: -1.210,00 RON',
    );
    expect(entry.details).toMatchObject({ emailedTo: 'a@b.ro' });
  });

  it('names the changed company fields in Romanian', () => {
    expect(
      companyUpdated(COMPANY, ['iban', 'anafConnectionId']).description,
    ).toBe(
      'Datele firmei ALFA SRL (CUI 123) au fost modificate: IBAN, certificat ANAF',
    );
  });

  it('describes an e-Factura upload with its index, state and error', () => {
    const upload = {
      id: 3,
      companyId: 7,
      invoiceId: 9,
      uploadIndex: '5001',
      status: UploadStatus.Rejected,
      environment: 'test',
      errorMessage: 'CIF invalid',
    } as Parameters<typeof efacturaUploaded>[0];
    expect(efacturaUploaded(upload, INVOICE).description).toBe(
      'Factura FCT 000012 a fost trimisă la e-Factura, index 5001: refuzată la încărcare (CIF invalid)',
    );
    expect(
      efacturaUploaded(
        { ...upload, status: UploadStatus.Processing, errorMessage: null },
        null,
      ).description,
    ).toBe(
      'Un fișier XML a fost trimis la e-Factura, index 5001: în prelucrare la ANAF',
    );
  });

  it('counts the loaded e-Factura messages with Romanian plurals', () => {
    expect(
      efacturaMessagesLoaded(COMPANY, 1, { zile: 30 }).description,
    ).toMatch(/: 1 mesaj$/);
    expect(efacturaMessagesLoaded(COMPANY, 3, {}).description).toMatch(
      /: 3 mesaje$/,
    );
    expect(efacturaMessagesLoaded(COMPANY, 25, {}).description).toMatch(
      /: 25 de mesaje$/,
    );
    expect(efacturaMessagesLoaded(COMPANY, 105, {}).description).toMatch(
      /: 105 mesaje$/,
    );
  });

  it('describes a validation outcome for an invoice and for an XML file', () => {
    expect(
      efacturaValidated(
        { valid: true, messages: [] },
        ValidateStandard.FACT1,
        INVOICE,
      ),
    ).toMatchObject({
      companyId: 7,
      description: 'Factura FCT 000012 a fost validată la ANAF: valid',
    });
    expect(
      efacturaValidated(
        { valid: false, messages: ['a', 'b'] },
        ValidateStandard.FCN,
        null,
      ),
    ).toMatchObject({
      companyId: null,
      description:
        'Un fișier XML (FCN) a fost validat la ANAF: invalid, 2 erori',
    });
  });

  it('summarizes an SPV import', () => {
    expect(
      spvImported({ fetched: 10, added: 1, certSerial: 'AB' }).description,
    ).toBe('Lista de mesaje SPV a fost importată: 1 mesaj nou din 10');
  });
});
