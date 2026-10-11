import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { QueryFailedError, type Repository } from 'typeorm';
import type { Company } from '../../companies/company.entity.js';
import type { AnafCompanyLookupService } from '../../companies/services/anaf-company-lookup.service.js';
import type { CompaniesService } from '../../companies/services/companies.service.js';
import { anafTvaRecord } from '../../testing/anaf-tva-record.js';
import { sampleInvoice } from '../../testing/invoice-fixtures.js';
import type { CreateInvoiceDto } from '../dto/invoice.dto.js';
import type { InvoiceFileStore } from './invoice-file-store.service.js';
import { bucharestToday } from '../helpers/invoice-format.js';
import type { InvoiceMailer } from './invoice-mailer.service.js';
import type { Invoice } from '../invoice.entity.js';
import { InvoicesService, STORAGE_NOT_CONFIGURED } from './invoices.service.js';

const COMPANY = {
  id: 7,
  accountantId: 1,
  cui: '12345678',
  name: 'AGRO VEST SRL',
  regCom: 'J35/100/2010',
  address: 'JUD. TIMIŞ, MUN. TIMIŞOARA, STR. EXEMPLU, NR.1',
  vatPayer: true,
  vatOnCollection: false,
  iban: 'RO49AAAA1B31007593840000',
  anafData: anafTvaRecord(),
} as Company;

function dto(overrides: Partial<CreateInvoiceDto> = {}): CreateInvoiceDto {
  return {
    companyId: 7,
    series: 'FCT',
    issueDate: '2026-10-04',
    deliveryDate: '2026-10-01',
    currency: 'RON',
    paymentMethod: 'transfer',
    buyer: { name: 'CLIENT SRL', cui: '87654321', address: 'Str. B' },
    lines: [
      {
        description: 'Servicii',
        quantity: 2,
        unit: 'serviciu',
        unitPrice: 100,
        vatRate: 21,
      },
    ],
    ...overrides,
  };
}

function uniqueViolation() {
  return new QueryFailedError('INSERT', [], {
    code: '23505',
  } as unknown as Error);
}

function setup({
  company = COMPANY,
  maximum = 11,
  save,
  stored,
  storeConfigured = true,
}: {
  company?: Company;
  maximum?: number | null;
  save?: (invoice: Invoice) => Promise<Invoice>;
  stored?: Invoice | null;
  storeConfigured?: boolean;
} = {}) {
  const invoices = {
    create: vi.fn((data: Partial<Invoice>) => ({ ...data })),
    save: vi.fn(
      save ??
        ((i: Invoice) => Promise.resolve(Object.assign({}, i, { id: 99 }))),
    ),
    maximum: vi.fn().mockResolvedValue(maximum),
    update: vi.fn().mockResolvedValue({}),
    findOneBy: vi.fn().mockResolvedValue(stored ?? null),
    findAndCount: vi.fn().mockResolvedValue([[sampleInvoice()], 1]),
    find: vi.fn().mockResolvedValue([]),
  };
  const companies = {
    get: vi.fn().mockResolvedValue(company),
    getLogo: vi
      .fn()
      .mockRejectedValue(new NotFoundException('Firma nu are logo')),
  };
  const anaf = { lookup: vi.fn().mockResolvedValue(anafTvaRecord(87654321)) };
  const store = {
    configured: storeConfigured,
    pathFor: vi.fn().mockReturnValue('1/7/FCT-000012.pdf'),
    put: vi.fn().mockResolvedValue(undefined),
    get: vi.fn(),
  };
  const mailer = { send: vi.fn().mockResolvedValue(undefined) };
  const service = new InvoicesService(
    invoices as unknown as Repository<Invoice>,
    companies as unknown as CompaniesService,
    anaf as unknown as AnafCompanyLookupService,
    store as unknown as InvoiceFileStore,
    mailer as unknown as InvoiceMailer,
  );
  return { service, invoices, companies, anaf, store, mailer };
}

describe('InvoicesService.lookupBuyer', () => {
  it('fills the buyer from ANAF', async () => {
    const { service, anaf } = setup();
    const buyer = await service.lookupBuyer(1, '87654321');
    expect(anaf.lookup).toHaveBeenCalledWith(1, '87654321');
    expect(buyer).toMatchObject({ cui: '87654321', name: 'AGRO VEST SRL' });
  });

  it('answers 400 when the CUI does not exist', async () => {
    const { service, anaf } = setup();
    anaf.lookup.mockResolvedValue(null);
    await expect(service.lookupBuyer(1, '99999999')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});

describe('InvoicesService.stats', () => {
  it('reads only the accountant rows from the window start and aggregates them', async () => {
    const { service, invoices } = setup();
    invoices.find.mockResolvedValue([
      {
        issueDate: bucharestToday(),
        currency: 'RON',
        exchangeRate: null,
        totalNet: 100,
        totalVatRon: 21,
        stornoOfInvoiceId: null,
      },
    ]);
    const stats = await service.stats(1);
    expect(invoices.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ accountantId: 1 }),
      }),
    );
    expect(stats.months).toHaveLength(6);
    expect(stats.year.grossRon).toBe(121);
  });
});

describe('InvoicesService.create', () => {
  it('snapshots the seller from the company and totals the lines', async () => {
    const { service, invoices } = setup();
    const { invoice } = await service.create(1, dto());
    expect(invoices.create).toHaveBeenCalledWith(
      expect.objectContaining({
        accountantId: 1,
        companyId: 7,
        totalNet: 200,
        totalVat: 42,
        totalGross: 242,
        seller: expect.objectContaining({
          name: 'AGRO VEST SRL',
          iban: 'RO49AAAA1B31007593840000',
          vatPayer: true,
        }),
      }),
    );
    expect(invoice.id).toBe(99);
  });

  it('numbers the invoice after the highest in the series', async () => {
    const { service, invoices } = setup({ maximum: 11 });
    const { invoice } = await service.create(1, dto());
    expect(invoices.maximum).toHaveBeenCalledWith('number', {
      companyId: 7,
      series: 'FCT',
    });
    expect(invoice.number).toBe(12);
  });

  it('starts a new series at 1', async () => {
    const { service } = setup({ maximum: null });
    expect((await service.create(1, dto())).invoice.number).toBe(1);
  });

  it('retries with the next number when another invoice took it', async () => {
    let calls = 0;
    const { service, invoices } = setup({
      save: (i) => {
        if (calls++ === 0) return Promise.reject(uniqueViolation());
        return Promise.resolve(Object.assign({}, i, { id: 5 }));
      },
    });
    invoices.maximum.mockResolvedValueOnce(11).mockResolvedValueOnce(12);
    const { invoice } = await service.create(1, dto());
    expect(invoice.number).toBe(13);
  });

  it('answers 409 when the requested number already exists', async () => {
    const { service } = setup({
      save: () => Promise.reject(uniqueViolation()),
    });
    await expect(service.create(1, dto({ number: 5 }))).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('rethrows unexpected database errors', async () => {
    const { service } = setup({
      save: () => Promise.reject(new Error('down')),
    });
    await expect(service.create(1, dto())).rejects.toThrow('down');
  });

  it('requires the exchange rate for foreign currency invoices', async () => {
    const { service } = setup();
    await expect(service.create(1, dto({ currency: 'EUR' }))).rejects.toThrow(
      'cursul de schimb',
    );
  });

  it('drops the exchange rate of RON invoices', async () => {
    const { service, invoices } = setup();
    await service.create(1, dto({ exchangeRate: 5 }));
    expect(invoices.create).toHaveBeenCalledWith(
      expect.objectContaining({ exchangeRate: null }),
    );
  });

  it('keeps VAT on collection only for VAT payers', async () => {
    const { service, invoices } = setup({
      company: Object.assign({}, COMPANY, { vatOnCollection: true }),
    });
    await service.create(1, dto());
    expect(invoices.create).toHaveBeenCalledWith(
      expect.objectContaining({ vatOnCollection: true }),
    );
  });

  it('charges no VAT when the company is not a VAT payer', async () => {
    const { service, invoices } = setup({
      company: Object.assign({}, COMPANY, { vatPayer: false }),
    });
    await service.create(1, dto());
    expect(invoices.create).toHaveBeenCalledWith(
      expect.objectContaining({ totalVat: 0, totalGross: 200 }),
    );
  });

  it('does not touch storage or mail unless asked', async () => {
    const { service, store, mailer } = setup();
    const result = await service.create(1, dto());
    expect(store.put).not.toHaveBeenCalled();
    expect(mailer.send).not.toHaveBeenCalled();
    expect(result).toMatchObject({ storageError: null, emailError: null });
  });

  it('saves the PDF in storage when asked', async () => {
    const { service, store, invoices } = setup();
    const { invoice, storageError } = await service.create(
      1,
      dto({ saveToStorage: true }),
    );
    expect(store.put).toHaveBeenCalledWith(
      '1/7/FCT-000012.pdf',
      expect.any(Buffer),
    );
    expect(invoices.update).toHaveBeenCalledWith(
      { id: 99 },
      { storagePath: '1/7/FCT-000012.pdf' },
    );
    expect(invoice.storagePath).toBe('1/7/FCT-000012.pdf');
    expect(storageError).toBeNull();
  });

  it('refuses to save in storage when Supabase is not configured', async () => {
    const { service, invoices } = setup({ storeConfigured: false });
    await expect(
      service.create(1, dto({ saveToStorage: true })),
    ).rejects.toThrow(STORAGE_NOT_CONFIGURED);
    expect(invoices.save).not.toHaveBeenCalled();
  });

  it('emails the PDF to the buyer when asked and records it', async () => {
    const { service, mailer, invoices } = setup();
    const { invoice, emailError } = await service.create(
      1,
      dto({ sendToEmail: 'client@exemplu.ro' }),
    );
    expect(mailer.send).toHaveBeenCalledWith(
      expect.objectContaining({ id: 99 }),
      'client@exemplu.ro',
      expect.any(Buffer),
    );
    expect(invoices.update).toHaveBeenCalledWith(
      { id: 99 },
      { emailedTo: 'client@exemplu.ro', emailedAt: expect.any(Date) },
    );
    expect(invoice.emailedTo).toBe('client@exemplu.ro');
    expect(emailError).toBeNull();
  });

  it('keeps the invoice and reports a failed email', async () => {
    const { service, mailer } = setup();
    mailer.send.mockRejectedValue(new Error('SMTP down'));
    const { invoice, emailError } = await service.create(
      1,
      dto({ sendToEmail: 'client@exemplu.ro' }),
    );
    expect(invoice.id).toBe(99);
    expect(invoice.emailedAt).toBeUndefined();
    expect(emailError).toContain('emailul nu a putut fi trimis');
    expect(emailError).not.toContain('SMTP down');
  });

  it('keeps the invoice and reports a failed storage upload', async () => {
    const { service, store } = setup();
    store.put.mockRejectedValue(new BadGatewayException('x'));
    const { invoice, storageError } = await service.create(
      1,
      dto({ saveToStorage: true }),
    );
    expect(invoice.id).toBe(99);
    expect(storageError).toContain('nu a putut fi salvată');
  });
});

describe('InvoicesService.get', () => {
  it('only finds invoices of the accountant', async () => {
    const { service, invoices } = setup({ stored: sampleInvoice() });
    await service.get(1, 1);
    expect(invoices.findOneBy).toHaveBeenCalledWith({ id: 1, accountantId: 1 });
  });

  it('answers 404 for an unknown invoice', async () => {
    const { service } = setup({ stored: null });
    await expect(service.get(1, 5)).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('InvoicesService.list', () => {
  it('pages the accountant invoices, newest first, and summarises them', async () => {
    const { service, invoices } = setup();
    const page = await service.list(1, { companyId: 7, page: 2, pageSize: 10 });
    expect(invoices.findAndCount).toHaveBeenCalledWith({
      where: { accountantId: 1, companyId: 7 },
      order: { issueDate: 'DESC', id: 'DESC' },
      skip: 10,
      take: 10,
    });
    expect(page.total).toBe(1);
    expect(page.items[0]).toMatchObject({
      series: 'FCT',
      number: 12,
      buyerName: 'CLIENT EXEMPLU SRL',
      stored: false,
    });
    expect(page.items[0]).not.toHaveProperty('lines');
  });
});

describe('InvoicesService.nextNumber', () => {
  it('checks the company belongs to the accountant, then returns max + 1', async () => {
    const { service, companies } = setup({ maximum: 4 });
    await expect(service.nextNumber(1, 7, 'FCT')).resolves.toBe(5);
    expect(companies.get).toHaveBeenCalledWith(1, 7);
  });
});

describe('InvoicesService downloads', () => {
  it('renders the PDF with the invoice file name', async () => {
    const { service } = setup({ stored: sampleInvoice() });
    const file = await service.download(1, 1);
    expect(file.filename).toBe('factura-FCT-000012.pdf');
    expect(file.contentType).toBe('application/pdf');
    expect((file.content as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('serves the stored copy when there is one', async () => {
    const { service, store } = setup({
      stored: sampleInvoice({ storagePath: '1/7/FCT-000012.pdf' }),
    });
    store.get.mockResolvedValue(Buffer.from('stored-pdf'));
    const file = await service.download(1, 1);
    expect(file.content.toString()).toBe('stored-pdf');
  });

  it('regenerates the PDF when the stored copy cannot be read', async () => {
    const { service, store } = setup({
      stored: sampleInvoice({ storagePath: '1/7/FCT-000012.pdf' }),
    });
    store.get.mockRejectedValue(new BadGatewayException('x'));
    const file = await service.download(1, 1);
    expect((file.content as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('renders the UBL XML', async () => {
    const { service } = setup({ stored: sampleInvoice() });
    const file = await service.downloadXml(1, 1);
    expect(file.filename).toBe('factura-FCT-000012.xml');
    expect(file.contentType).toBe('application/xml');
    expect(String(file.content)).toContain('<Invoice');
  });
});

describe('InvoicesService.saveToStorage', () => {
  it('uploads the PDF of an existing invoice', async () => {
    const { service, store } = setup({ stored: sampleInvoice() });
    const invoice = await service.saveToStorage(1, 1);
    expect(store.put).toHaveBeenCalled();
    expect(invoice.storagePath).toBe('1/7/FCT-000012.pdf');
  });

  it('refuses when Supabase is not configured', async () => {
    const { service } = setup({
      stored: sampleInvoice(),
      storeConfigured: false,
    });
    await expect(service.saveToStorage(1, 1)).rejects.toThrow(
      STORAGE_NOT_CONFIGURED,
    );
  });
});

describe('InvoicesService.send', () => {
  it('sends to the given address', async () => {
    const { service, mailer } = setup({ stored: sampleInvoice() });
    await service.send(1, 1, 'alt@exemplu.ro');
    expect(mailer.send).toHaveBeenCalledWith(
      expect.anything(),
      'alt@exemplu.ro',
      expect.any(Buffer),
    );
  });

  it('defaults to the email of the buyer', async () => {
    const { service, mailer } = setup({ stored: sampleInvoice() });
    await service.send(1, 1, undefined);
    expect(mailer.send).toHaveBeenCalledWith(
      expect.anything(),
      'client@exemplu.ro',
      expect.any(Buffer),
    );
  });

  it('asks for an address when the buyer has none', async () => {
    const base = sampleInvoice();
    const { service } = setup({
      stored: sampleInvoice({ buyer: { ...base.buyer, email: null } }),
    });
    await expect(service.send(1, 1, null)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('answers 502 without leaking the SMTP error', async () => {
    const { service, mailer } = setup({ stored: sampleInvoice() });
    mailer.send.mockRejectedValue(new Error('535 bad password'));
    const err = await service.send(1, 1, 'a@b.ro').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(BadGatewayException);
    expect((err as Error).message).not.toContain('535');
  });
});
