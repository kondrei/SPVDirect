import { BadRequestException, ConflictException } from '@nestjs/common';
import type { Repository } from 'typeorm';
import type { AnafCompanyLookupService } from '../../companies/services/anaf-company-lookup.service.js';
import type { CompaniesService } from '../../companies/services/companies.service.js';
import { sampleInvoice } from '../../testing/invoice-fixtures.js';
import { computeInvoice } from '../helpers/invoice-calc.js';
import type { InvoiceFileStore } from './invoice-file-store.service.js';
import type { InvoiceMailer } from './invoice-mailer.service.js';
import { buildStornoLines, remainingQuantities } from '../helpers/invoice-storno.js';
import type { Invoice } from '../invoice.entity.js';
import { InvoicesService } from './invoices.service.js';

function setup({
  original = sampleInvoice({ id: 3, number: 12 }),
  stornos = [],
  maximum = 20,
  page = [],
  reversedIds = [],
}: {
  original?: Invoice | null;
  stornos?: Invoice[];
  maximum?: number | null;
  page?: Invoice[];
  reversedIds?: number[];
} = {}) {
  const invoices = {
    findOneBy: vi.fn().mockResolvedValue(original),
    findBy: vi.fn().mockResolvedValue(stornos),
    find: vi
      .fn()
      .mockResolvedValue(reversedIds.map((id) => ({ stornoOfInvoiceId: id }))),
    findAndCount: vi.fn().mockResolvedValue([page, page.length]),
    create: vi.fn((data: Partial<Invoice>) => Object.assign({}, data)),
    save: vi.fn((i: Invoice) =>
      Promise.resolve(Object.assign({}, i, { id: 50 })),
    ),
    maximum: vi.fn().mockResolvedValue(maximum),
    update: vi.fn().mockResolvedValue({}),
  };
  const store = {
    configured: true,
    pathFor: vi.fn().mockReturnValue('1/7/FCT-000021.pdf'),
    put: vi.fn().mockResolvedValue(undefined),
    get: vi.fn(),
  };
  const mailer = { send: vi.fn().mockResolvedValue(undefined) };
  const companies = { getLogo: vi.fn().mockResolvedValue(null) };
  const service = new InvoicesService(
    invoices as unknown as Repository<Invoice>,
    companies as unknown as CompaniesService,
    {} as AnafCompanyLookupService,
    store as unknown as InvoiceFileStore,
    mailer as unknown as InvoiceMailer,
  );
  return { service, invoices, store, mailer };
}

describe('InvoicesService.createStorno', () => {
  it('reverses the whole invoice with negative amounts and a reference to it', async () => {
    const { service, invoices } = setup();
    const { invoice } = await service.createStorno(1, 3, {
      issueDate: '2026-10-10',
    });
    const original = sampleInvoice();
    expect(invoices.findOneBy).toHaveBeenCalledWith({ id: 3, accountantId: 1 });
    expect(invoices.create).toHaveBeenCalledWith(
      expect.objectContaining({
        accountantId: 1,
        companyId: 7,
        series: 'FCT',
        issueDate: '2026-10-10',
        deliveryDate: '2026-10-10',
        dueDate: null,
        totalNet: -original.totalNet,
        totalVat: -original.totalVat,
        totalGross: -original.totalGross,
        stornoOfInvoiceId: 3,
        stornoOfSeries: 'FCT',
        stornoOfNumber: 12,
        stornoOfIssueDate: '2026-10-04',
        seller: original.seller,
        buyer: original.buyer,
      }),
    );
    expect(invoice.number).toBe(21);
    expect(invoice.lines.map((l) => l.quantity)).toEqual([-1, -1]);
    expect(invoice.lines.map((l) => l.stornoOfLine)).toEqual([0, 1]);
  });

  it('can use another series and add a note', async () => {
    const { service, invoices } = setup({ maximum: null });
    const { invoice } = await service.createStorno(1, 3, {
      issueDate: '2026-10-10',
      series: 'STR',
      notes: 'Retur marfă',
    });
    expect(invoices.maximum).toHaveBeenCalledWith('number', {
      companyId: 7,
      series: 'STR',
    });
    expect(invoice).toMatchObject({
      series: 'STR',
      number: 1,
      notes: 'Retur marfă',
    });
  });

  it('reverses only the requested quantity of a line', async () => {
    const original = sampleInvoice({
      id: 3,
      lines: computeInvoice(
        [
          {
            description: 'Bunuri',
            quantity: 10,
            unit: 'buc',
            unitPrice: 10,
            vatRate: 21,
            vatCategory: 'S',
            vatExemptionReason: null,
          },
        ],
        null,
      ).lines,
    });
    const { service } = setup({ original });
    const { invoice } = await service.createStorno(1, 3, {
      issueDate: '2026-10-10',
      lines: [{ lineIndex: 0, quantity: 2 }],
    });
    expect(invoice.totalNet).toBe(-20);
    expect(invoice.totalVat).toBe(-4.2);
    expect(invoice.totalGross).toBe(-24.2);
  });

  it('refuses to reverse again what an earlier storno already reversed', async () => {
    const original = sampleInvoice({ id: 3 });
    const first = computeInvoice(
      buildStornoLines(original, remainingQuantities(original, []), undefined),
      null,
    );
    const earlier = sampleInvoice({
      id: 40,
      stornoOfInvoiceId: 3,
      lines: first.lines,
    });
    const { service, invoices } = setup({ original, stornos: [earlier] });
    await expect(
      service.createStorno(1, 3, { issueDate: '2026-10-10' }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(invoices.save).not.toHaveBeenCalled();
    expect(invoices.findBy).toHaveBeenCalledWith({
      accountantId: 1,
      stornoOfInvoiceId: 3,
    });
  });

  it('refuses to reverse a storno invoice', async () => {
    const { service } = setup({
      original: sampleInvoice({ id: 9, stornoOfInvoiceId: 3 }),
    });
    await expect(
      service.createStorno(1, 9, { issueDate: '2026-10-10' }),
    ).rejects.toThrow('nu poate fi stornată');
  });

  it('refuses an issue date before the reversed invoice', async () => {
    const { service } = setup();
    await expect(
      service.createStorno(1, 3, { issueDate: '2026-10-01' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuses an impossible date', async () => {
    const { service } = setup();
    await expect(
      service.createStorno(1, 3, { issueDate: '2026-02-30' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('defaults the issue date to today in Bucharest', async () => {
    const { service, invoices } = setup({
      original: sampleInvoice({ id: 3, issueDate: '2020-01-01' }),
    });
    await service.createStorno(1, 3, {});
    const created = invoices.create.mock.calls[0][0] as Invoice;
    expect(created.issueDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(created.issueDate).toBe(created.deliveryDate);
  });

  it('saves the PDF and emails it when asked', async () => {
    const { service, store, mailer } = setup();
    const result = await service.createStorno(1, 3, {
      issueDate: '2026-10-10',
      saveToStorage: true,
      sendToEmail: 'client@exemplu.ro',
    });
    expect(store.put).toHaveBeenCalled();
    expect(mailer.send).toHaveBeenCalledWith(
      expect.objectContaining({ id: 50 }),
      'client@exemplu.ro',
      expect.any(Buffer),
    );
    expect(result).toMatchObject({ storageError: null, emailError: null });
  });
});

describe('InvoicesService.detail', () => {
  it('tells how much of each line can still be reversed', async () => {
    const original = sampleInvoice({ id: 3 });
    const first = computeInvoice(
      buildStornoLines(original, [1, 1], [{ lineIndex: 0, quantity: 1 }]),
      null,
    );
    const earlier = sampleInvoice({
      id: 40,
      stornoOfInvoiceId: 3,
      lines: first.lines,
    });
    const { service } = setup({ original, stornos: [earlier] });
    const detail = await service.detail(1, 3);
    expect(detail.remainingQuantities).toEqual([0, 1]);
    expect(detail.series).toBe('FCT');
  });

  it('has nothing to reverse on a storno invoice', async () => {
    const { service } = setup({
      original: sampleInvoice({ id: 9, stornoOfInvoiceId: 3 }),
    });
    expect((await service.detail(1, 9)).remainingQuantities).toBeNull();
  });
});

describe('InvoicesService.list storno flags', () => {
  it('marks invoices that were reversed and shows what a storno reverses', async () => {
    const storno = sampleInvoice({
      id: 2,
      stornoOfInvoiceId: 1,
      stornoOfSeries: 'FCT',
      stornoOfNumber: 12,
    });
    const { service, invoices } = setup({
      page: [storno, sampleInvoice({ id: 1 })],
      reversedIds: [1],
    });
    const page = await service.list(1, { page: 1, pageSize: 25 });
    expect(invoices.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ accountantId: 1 }),
      }),
    );
    expect(page.items[0]).toMatchObject({
      id: 2,
      stornoed: false,
      stornoOfSeries: 'FCT',
      stornoOfNumber: 12,
    });
    expect(page.items[1]).toMatchObject({ id: 1, stornoed: true });
  });

  it('does not query for storno invoices on an empty page', async () => {
    const { service, invoices } = setup({ page: [] });
    await service.list(1, { page: 1, pageSize: 25 });
    expect(invoices.find).not.toHaveBeenCalled();
  });
});
