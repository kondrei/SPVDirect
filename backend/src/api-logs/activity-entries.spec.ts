import {
  EfacturaDirection,
  UploadStatus,
  ValidateStandard,
} from '../efactura/dto/efactura.enums.js';
import type { Invoice } from '../invoices/invoice.entity.js';
import { ServiceUnavailableException } from '@nestjs/common';
import {
  companiesPurged,
  companyUpdated,
  efacturaArchiveEmailed,
  efacturaArchiveImported,
  efacturaArchiveSyncCompleted,
  efacturaArchiveSyncFailed,
  efacturaMessagesLoaded,
  efacturaUploaded,
  efacturaValidated,
  invoiceIssued,
  jobFailed,
  purgeCompleted,
  spvImported,
} from './activity-entries.js';
import { MAX_JOB_ERROR_LENGTH } from './dto/api-log.constants.js';
import {
  ActivityAction,
  JobActivityAction,
  ScheduledJob,
} from './dto/api-log.enums.js';

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

  it('summarizes an e-Factura archive import with what was left out', () => {
    expect(
      efacturaArchiveImported(
        COMPANY,
        { imported: 3, already: 1, skipped: 1, failed: 1 },
        false,
      ),
    ).toEqual({
      action: ActivityAction.EfacturaArchiveImported,
      companyId: 7,
      description:
        'Au fost importate în arhiva e-Factura a firmei ALFA SRL (CUI 123) 3 facturi (2 existau deja sau nu sunt facturi, 1 eroare)',
      details: {
        companyName: 'ALFA SRL',
        cui: '123',
        imported: 3,
        already: 1,
        skipped: 1,
        failed: 1,
        automatic: false,
      },
    });
    expect(
      efacturaArchiveImported(
        COMPANY,
        { imported: 1, already: 0, skipped: 0, failed: 0 },
        true,
      ).description,
    ).toBe(
      'Importul automat a adăugat în arhiva e-Factura a firmei ALFA SRL (CUI 123) 1 factură',
    );
    expect(
      efacturaArchiveImported(
        COMPANY,
        { imported: 1, already: 0, skipped: 0, failed: 0 },
        true,
      ).details,
    ).toMatchObject({ automatic: true, job: ScheduledJob.EfacturaArchiveSync });
  });

  it('describes a purge for one accountant by count only, never by company name', () => {
    expect(companiesPurged(1, 30)).toEqual({
      action: ActivityAction.CompaniesPurged,
      description:
        '1 firmă ștearsă acum peste 30 de zile a fost eliminată definitiv, cu facturile, fișierele e-Factura și mesajele SPV',
      details: { job: ScheduledJob.Purge, companies: 1 },
    });
    expect(companiesPurged(21, 30).description).toMatch(
      /^21 de firme șterse .* au fost eliminate/,
    );
  });

  it('shows the accountant an automatic import failure, keeping only HTTP messages', () => {
    const shown = efacturaArchiveSyncFailed(
      COMPANY,
      new ServiceUnavailableException('ANAF nu răspunde'),
    );
    expect(shown).toMatchObject({
      action: ActivityAction.EfacturaArchiveSyncFailed,
      companyId: 7,
      description:
        'Importul automat în arhiva e-Factura a firmei ALFA SRL (CUI 123) a eșuat: ANAF nu răspunde',
      details: { job: ScheduledJob.EfacturaArchiveSync },
    });
    expect(
      efacturaArchiveSyncFailed(COMPANY, new Error('relation does not exist'))
        .details?.error,
    ).toBe('eroare neașteptată');
  });

  it('logs an archived invoice sent by email with its partner', () => {
    expect(
      efacturaArchiveEmailed(
        {
          id: 31,
          companyId: 7,
          anafMessageId: '3001',
          direction: EfacturaDirection.Received,
          number: 'F-1',
          issueDate: '2026-10-02',
          supplierName: 'GAMA SRL',
          customerName: 'ALFA SRL',
        },
        'contabil@example.com',
      ),
    ).toMatchObject({
      action: ActivityAction.EfacturaArchiveEmailed,
      companyId: 7,
      description:
        'Factura primită F-1 (GAMA SRL) a fost trimisă pe email la contabil@example.com',
      details: { archiveId: 31, to: 'contabil@example.com' },
    });
  });

  it('describes a clean job run without an error count', () => {
    expect(
      purgeCompleted({ companies: 0, accountants: 2, failed: 0 }).description,
    ).toBe(
      'Ștergerea definitivă a datelor șterse a rulat: 0 firme și 2 conturi șterse definitiv',
    );
    expect(
      efacturaArchiveSyncCompleted({ companies: 25, imported: 1, failed: 0 })
        .description,
    ).toBe(
      'Importul automat în arhiva e-Factura a rulat: 1 factură importată pentru 25 de firme',
    );
  });

  it('cuts a long job error and accepts non-Error values', () => {
    const entry = jobFailed(ScheduledJob.Purge, new Error('x'.repeat(900)));
    expect(entry.action).toBe(JobActivityAction.Failed);
    expect(entry.error).toHaveLength(MAX_JOB_ERROR_LENGTH);
    expect(jobFailed(ScheduledJob.SpvSync, 'timeout').error).toBe('timeout');
  });
});
