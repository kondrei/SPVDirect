import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import type { Company } from '../../companies/company.entity.js';
import { anafTvaRecord } from '../../testing/anaf-tva-record.js';
import { sampleInvoice } from '../../testing/invoice-fixtures.js';
import type { CreateInvoiceDto } from '../dto/invoice.dto.js';
import { bucharestToday } from '../helpers/invoice-format.js';
import type { Invoice } from '../invoice.entity.js';
import { ActivityAction } from '../../api-logs/dto/api-log.enums.js';
import { buildInvoiceServices } from '../../testing/invoice-services.js';
import { STORAGE_NOT_CONFIGURED } from './invoice-delivery.service.js';
import { Currency, PaymentMethod } from '../dto/invoice.enums.js';

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
    currency: Currency.RON,
    paymentMethod: PaymentMethod.Transfer,
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
  earlierMaximum,
  earlierTaken,
}: {
  company?: Company;
  maximum?: number | null;
  earlierMaximum?: number | null;
  earlierTaken?: boolean;
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
  const { service, earlier, lockedCompanies, activity } = buildInvoiceServices({
    invoices,
    companies,
    anaf,
    store,
    mailer,
    earlierMaximum,
    earlierTaken,
  });
  return {
    activity,
    service,
    invoices,
    earlier,
    lockedCompanies,
    companies,
    anaf,
    store,
    mailer,
  };
}

describe('InvoiceBuyersService.lookupBuyer', () => {
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

function withQueryBuilder(rows: Partial<Invoice>[]) {
  const ctx = setup();
  const qb = {
    select: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    andWhere: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    addOrderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    getOne: vi.fn().mockResolvedValue(rows[0] ?? null),
    getMany: vi.fn().mockResolvedValue(rows),
  };
  Object.assign(ctx.invoices, { createQueryBuilder: vi.fn(() => qb) });
  return { ...ctx, qb };
}

function expectInvoicesToBuyer(qb: ReturnType<typeof withQueryBuilder>['qb']) {
  expect(qb.where).toHaveBeenCalledWith(
    'invoice.accountantId = :accountantId',
    {
      accountantId: 1,
    },
  );
  expect(qb.andWhere).toHaveBeenCalledWith(
    "invoice.buyer ->> 'cui' = :buyerCui",
    {
      buyerCui: '87654321',
    },
  );
  expect(qb.andWhere).toHaveBeenCalledWith('invoice.stornoOfInvoiceId IS NULL');
  expect(qb.orderBy).toHaveBeenCalledWith('invoice.issueDate', 'DESC');
  expect(qb.addOrderBy).toHaveBeenCalledWith('invoice.id', 'DESC');
}

describe('InvoiceBuyersService.findBuyer', () => {
  function withSaved({
    invoice = null,
    company = null,
  }: { invoice?: Partial<Invoice> | null; company?: Company | null } = {}) {
    const ctx = withQueryBuilder(invoice ? [invoice] : []);
    Object.assign(ctx.companies, {
      findByCui: vi.fn().mockResolvedValue(company),
    });
    return ctx;
  }

  it('takes the buyer from the accountant’s latest invoice to that CUI, with the current ANAF status', async () => {
    const invoice = sampleInvoice({
      buyer: {
        ...sampleInvoice().buyer,
        cui: '87654321',
        email: 'client@exemplu.ro',
        vatPayer: false,
      },
    });
    const { service, qb, anaf } = withSaved({ invoice });
    const record = anafTvaRecord(87654321);
    record.stare_inactiv.statusInactivi = true;
    anaf.lookup.mockResolvedValue(record);
    const buyer = await service.findBuyer(1, '87654321');
    expectInvoicesToBuyer(qb);
    expect(qb.limit).toHaveBeenCalledWith(1);
    expect(anaf.lookup).toHaveBeenCalledWith(1, '87654321');
    expect(buyer).toEqual({
      ...invoice.buyer,
      vatPayer: true,
      inactive: true,
      eFactura: true,
      anafChecked: true,
      source: 'invoice',
    });
  });

  it('keeps the saved buyer, marked as not checked at ANAF, when ANAF fails or does not know the CUI', async () => {
    const invoice = sampleInvoice({
      buyer: { ...sampleInvoice().buyer, cui: '87654321' },
    });
    for (const answer of [
      () => Promise.reject(new BadGatewayException('ANAF indisponibil')),
      () => Promise.resolve(null),
    ]) {
      const { service, anaf } = withSaved({ invoice });
      anaf.lookup.mockImplementation(answer);
      expect(await service.findBuyer(1, '87654321')).toEqual({
        ...invoice.buyer,
        inactive: null,
        eFactura: null,
        anafChecked: false,
        source: 'invoice',
      });
    }
  });

  it('falls back to the accountant’s own company with that CUI', async () => {
    const { service, companies, anaf } = withSaved({
      company: Object.assign({}, COMPANY, { inactive: false, eFactura: true }),
    });
    const buyer = await service.findBuyer(1, '12345678');
    expect(
      (companies as unknown as { findByCui: ReturnType<typeof vi.fn> })
        .findByCui,
    ).toHaveBeenCalledWith(1, '12345678');
    expect(buyer).toMatchObject({
      name: 'AGRO VEST SRL',
      cui: '12345678',
      address: COMPANY.address,
      vatPayer: true,
      inactive: false,
      eFactura: true,
      anafChecked: false,
      source: 'company',
    });
    expect(anaf.lookup).not.toHaveBeenCalled();
  });

  it('asks ANAF when nothing is saved, or the saved company has no address', async () => {
    for (const company of [
      null,
      Object.assign({}, COMPANY, { address: null }),
      Object.assign({}, COMPANY, { address: '   ' }),
    ]) {
      const { service, anaf } = withSaved({ company });
      const buyer = await service.findBuyer(1, '87654321');
      expect(anaf.lookup).toHaveBeenCalledWith(1, '87654321');
      expect(buyer).toMatchObject({
        cui: '87654321',
        anafChecked: true,
        source: 'anaf',
      });
    }
  });

  it('answers 400 when the CUI is nowhere, not even at ANAF', async () => {
    const { service, anaf } = withSaved();
    anaf.lookup.mockResolvedValue(null);
    await expect(service.findBuyer(1, '99999999')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});

describe('InvoiceBuyersService.lineSuggestions', () => {
  it('reads the lines of the last invoices for that company and buyer, never stornos', async () => {
    const invoice = sampleInvoice();
    const { service, companies, qb } = withQueryBuilder([invoice]);
    const result = await service.lineSuggestions(1, 7, '87654321');
    expect(companies.get).toHaveBeenCalledWith(1, 7);
    expectInvoicesToBuyer(qb);
    expect(qb.andWhere).toHaveBeenCalledWith('invoice.companyId = :companyId', {
      companyId: 7,
    });
    expect(qb.limit).toHaveBeenCalledWith(50);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      description: invoice.lines[0].description,
      unitPrice: invoice.lines[0].unitPrice,
      currency: Currency.RON,
      issueDate: '2026-10-04',
    });
  });

  it('answers 404 before querying when the company is not the accountant’s', async () => {
    const { service, companies, invoices } = withQueryBuilder([]);
    companies.get.mockRejectedValue(
      new NotFoundException('Firma nu a fost găsită'),
    );
    await expect(
      service.lineSuggestions(1, 99, '87654321'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(
      (invoices as unknown as { createQueryBuilder: ReturnType<typeof vi.fn> })
        .createQueryBuilder,
    ).not.toHaveBeenCalled();
  });
});

describe('InvoicesService.stats', () => {
  it('reads only the accountant rows from the window start and aggregates them', async () => {
    const { service, invoices } = setup();
    invoices.find.mockResolvedValue([
      {
        issueDate: bucharestToday(),
        currency: Currency.RON,
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

  it('continues the series of a deleted company with the same CUI', async () => {
    const { service, earlier } = setup({ maximum: null, earlierMaximum: 41 });
    expect((await service.create(1, dto())).invoice.number).toBe(42);
    expect(earlier.withDeleted).toHaveBeenCalled();
    expect(earlier.where).toHaveBeenCalledWith('i.series = :series', {
      series: 'FCT',
    });
  });

  it('keeps its own numbering when it is ahead of a deleted company', async () => {
    const { service } = setup({ maximum: 11, earlierMaximum: 5 });
    expect((await service.create(1, dto())).invoice.number).toBe(12);
  });

  it('answers 409 when a deleted company with the same CUI used the requested number', async () => {
    const { service, invoices } = setup({ earlierTaken: true });
    await expect(service.create(1, dto({ number: 5 }))).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(invoices.save).not.toHaveBeenCalled();
  });

  it('locks the live company row before numbering', async () => {
    const { service, lockedCompanies, invoices } = setup();
    await service.create(1, dto());
    expect(lockedCompanies).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        where: { accountantId: 1, id: 7 },
        lock: { mode: 'pessimistic_write' },
      }),
    );
    expect(lockedCompanies.mock.invocationCallOrder[0]).toBeLessThan(
      invoices.maximum.mock.invocationCallOrder[0],
    );
  });

  it('answers 404 when the company was deleted while the invoice was being issued', async () => {
    const { service, lockedCompanies, invoices } = setup();
    lockedCompanies.mockResolvedValueOnce([]);
    await expect(service.create(1, dto())).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(invoices.save).not.toHaveBeenCalled();
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
    await expect(
      service.create(1, dto({ currency: Currency.EUR })),
    ).rejects.toThrow('cursul de schimb');
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

  it('logs the issued invoice and the email that really went out', async () => {
    const { service, activity, mailer } = setup();
    mailer.send.mockRejectedValue(new Error('SMTP down'));
    await service.create(1, dto({ sendToEmail: 'client@exemplu.ro' }));
    expect(activity.record).toHaveBeenCalledWith(
      1,
      expect.objectContaining({
        action: ActivityAction.InvoiceIssued,
        details: expect.objectContaining({
          invoiceId: 99,
          emailedTo: null,
          stored: false,
        }),
      }),
    );
  });

  it('logs nothing when the invoice is not issued', async () => {
    const { service, activity } = setup();
    await expect(
      service.create(1, dto({ currency: Currency.EUR })),
    ).rejects.toThrow();
    expect(activity.record).not.toHaveBeenCalled();
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

describe('InvoiceDeliveryService downloads', () => {
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

describe('InvoiceDeliveryService.saveToStorage', () => {
  it('uploads the PDF of an existing invoice', async () => {
    const { service, store } = setup({ stored: sampleInvoice() });
    const invoice = await service.saveToStorage(1, 1);
    expect(store.put).toHaveBeenCalled();
    expect(invoice.storagePath).toBe('1/7/FCT-000012.pdf');
  });

  it('logs the invoice saved in storage', async () => {
    const { service, activity } = setup({ stored: sampleInvoice() });
    await service.saveToStorage(1, 1);
    expect(activity.record).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ action: ActivityAction.InvoiceStored }),
    );
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

describe('InvoiceDeliveryService.send', () => {
  it('sends to the given address', async () => {
    const { service, mailer, activity } = setup({ stored: sampleInvoice() });
    await service.send(1, 1, 'alt@exemplu.ro');
    expect(activity.record).toHaveBeenCalledWith(
      1,
      expect.objectContaining({
        action: ActivityAction.InvoiceSent,
        details: expect.objectContaining({ emailedTo: 'alt@exemplu.ro' }),
      }),
    );
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
