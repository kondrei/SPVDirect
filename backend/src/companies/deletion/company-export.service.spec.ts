import { NotFoundException } from '@nestjs/common';
import { strFromU8, unzipSync } from 'fflate';
import type { Readable } from 'node:stream';
import type { Repository } from 'typeorm';
import type { SpvArchiveService } from '../../anaf/spv/services/spv-archive.service.js';
import type { SpvMessage } from '../../anaf/spv/spv-message.entity.js';
import type { EfacturaUpload } from '../../efactura/efactura-upload.entity.js';
import type { EfacturaArchiveService } from '../../efactura/services/efactura-archive.service.js';
import type { Invoice } from '../../invoices/invoice.entity.js';
import type { InvoiceDeliveryService } from '../../invoices/services/invoice-delivery.service.js';
import type { Company } from '../company.entity.js';
import type { CompaniesService } from '../services/companies.service.js';
import { CompanyExportService } from './company-export.service.js';
import { Currency } from '../../invoices/dto/invoice.enums.js';
import type { ActivityLogsService } from '../../api-logs/activity-logs.service.js';
import { fakeActivityLogs } from '../../testing/activity-logs.js';
import { SpvMessageRepository } from '../../anaf/spv/repositories/spv-message.repository.js';
import { EfacturaUploadRepository } from '../../efactura/repositories/efactura-upload.repository.js';
import { InvoiceRepository } from '../../invoices/repositories/invoice.repository.js';

const COMPANY = {
  id: 7,
  accountantId: 1,
  cui: '123',
  name: 'ALFA SRL',
  logoContentType: 'image/png',
} as Company;

const INVOICE = {
  id: 11,
  series: 'A',
  number: 1,
  issueDate: '2026-10-01',
  deliveryDate: '2026-10-01',
  dueDate: null,
  currency: Currency.RON,
  buyer: { name: 'BETA SRL', cui: '456' },
  totalNet: 100,
  totalVat: 21,
  totalGross: 121,
  stornoOfSeries: null,
  stornoOfNumber: null,
  createdAt: new Date('2026-10-01T08:00:00Z'),
} as unknown as Invoice;

function setup() {
  const spvBuilder = {
    where: vi.fn().mockReturnThis(),
    andWhere: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    addOrderBy: vi.fn().mockReturnThis(),
    getMany: vi.fn().mockResolvedValue([
      { id: 20, anafMessageId: '900', cif: '123', downloadedAt: new Date() },
      { id: 21, anafMessageId: '901', cif: '123', downloadedAt: null },
    ]),
  };
  const companies = {
    get: vi.fn().mockResolvedValue(COMPANY),
    getLogo: vi.fn().mockResolvedValue({
      content: Buffer.from('png'),
      contentType: 'image/png',
    }),
  };
  const invoices = { find: vi.fn().mockResolvedValue([INVOICE]) };
  const uploads = {
    find: vi
      .fn()
      .mockResolvedValue([
        { id: 5, invoiceId: 11, environment: 'test', status: 'ok' },
      ]),
  };
  const messages = { createQueryBuilder: vi.fn().mockReturnValue(spvBuilder) };
  const delivery = {
    pdf: vi.fn().mockResolvedValue({
      content: Buffer.from('%PDF'),
      contentType: 'application/pdf',
      filename: 'factura-A-000001.pdf',
    }),
    xml: vi.fn().mockResolvedValue({
      content: Buffer.from('<Invoice/>'),
      contentType: 'application/xml',
      filename: 'factura-A-000001.xml',
    }),
  };
  const spv = {
    download: vi.fn().mockResolvedValue({
      content: Buffer.from('%PDF-spv'),
      contentType: 'application/pdf',
      filename: 'mesaj-900.pdf',
    }),
  };
  const efacturaArchive = {
    forCompany: vi.fn().mockResolvedValue([
      {
        id: 31,
        anafMessageId: '55',
        environment: 'prod',
        direction: 'received',
        standard: 'UBL',
        number: 'F1',
        issueDate: '2026-10-02',
        supplierName: 'GAMA SRL',
        supplierCui: '789',
        customerName: 'ALFA SRL',
        customerCui: '123',
        totalGross: 50,
      },
    ]),
    zip: vi.fn().mockResolvedValue({
      content: Buffer.from('PK-archived'),
      contentType: 'application/zip',
      filename: 'factura-F1-55.zip',
    }),
  };
  const activity = fakeActivityLogs();
  const service = new CompanyExportService(
    companies as unknown as CompaniesService,
    new InvoiceRepository(invoices as unknown as Repository<Invoice>),
    new EfacturaUploadRepository(
      uploads as unknown as Repository<EfacturaUpload>,
    ),
    new SpvMessageRepository(messages as unknown as Repository<SpvMessage>),
    delivery as unknown as InvoiceDeliveryService,
    spv as unknown as SpvArchiveService,
    efacturaArchive as unknown as EfacturaArchiveService,
    activity as unknown as ActivityLogsService,
  );
  return {
    service,
    companies,
    invoices,
    uploads,
    delivery,
    spv,
    efacturaArchive,
    activity,
  };
}

async function unzip(stream: Readable): Promise<Record<string, string>> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  const files = unzipSync(Buffer.concat(chunks));
  return Object.fromEntries(
    Object.entries(files).map(([name, bytes]) => [name, strFromU8(bytes)]),
  );
}

describe('CompanyExportService', () => {
  it('names the ZIP after the CUI and the day', async () => {
    const { service } = setup();
    const result = await service.export(1, 7, new Date('2026-10-19T10:00:00Z'));
    expect(result.contentType).toBe('application/zip');
    expect(result.filename).toBe('firma-123-export-2026-10-19.zip');
    await unzip(result.content);
  });

  it('packs the company, invoices with PDF and XML, e-Factura uploads and stored SPV documents', async () => {
    const { service, spv } = setup();
    const files = await unzip((await service.export(1, 7)).content);
    expect(Object.keys(files).toSorted((a, b) => a.localeCompare(b))).toEqual([
      'efactura-arhiva.csv',
      'efactura-arhiva/factura-F1-55.zip',
      'efactura.csv',
      'facturi.csv',
      'facturi.json',
      'facturi/factura-A-000001.pdf',
      'facturi/factura-A-000001.xml',
      'firma.json',
      'logo.png',
      'spv.csv',
      'spv/mesaj-900.pdf',
    ]);
    expect(JSON.parse(files['firma.json'])).toMatchObject({ cui: '123' });
    expect(files['facturi.csv']).toContain('11;A;1;2026-10-01;');
    expect(files['facturi.csv']).toContain('BETA SRL;456;100;21;121');
    expect(files['facturi/factura-A-000001.xml']).toBe('<Invoice/>');
    expect(files['efactura.csv']).toContain('5;11;test;');
    expect(files['spv.csv']).toContain('21;901;123');
    expect(files['efactura-arhiva.csv']).toContain(
      '31;55;;prod;received;UBL;;F1;2026-10-02;;;GAMA SRL;789;ALFA SRL;123;;;50',
    );
    expect(files['efactura-arhiva/factura-F1-55.zip']).toBe('PK-archived');
    expect(spv.download).toHaveBeenCalledOnce();
    expect(spv.download).toHaveBeenCalledWith(1, 20);
  });

  it('reads only live rows of this accountant and company', async () => {
    const { service, invoices, uploads, efacturaArchive } = setup();
    await unzip((await service.export(1, 7)).content);
    expect(invoices.find).toHaveBeenCalledWith(
      expect.objectContaining({ where: { accountantId: 1, companyId: 7 } }),
    );
    expect(uploads.find).toHaveBeenCalledWith(
      expect.objectContaining({ where: { accountantId: 1, companyId: 7 } }),
    );
    expect(efacturaArchive.forCompany).toHaveBeenCalledWith(1, 7);
  });

  it('lists a file that could not be read in erori.txt and keeps going', async () => {
    const { service, delivery } = setup();
    delivery.pdf.mockRejectedValue(new Error('Stocarea nu este disponibilă'));
    const files = await unzip((await service.export(1, 7)).content);
    expect(files['erori.txt']).toBe('facturi: Stocarea nu este disponibilă\n');
    expect(files['facturi/factura-A-000001.xml']).toBe('<Invoice/>');
    expect(files['spv/mesaj-900.pdf']).toBe('%PDF-spv');
  });

  it('stops loading files once the download is aborted', async () => {
    const { service, delivery, spv } = setup();
    const result = await service.export(1, 7);
    result.content.destroy();
    await new Promise((resolve) => setImmediate(resolve));
    expect(delivery.pdf).not.toHaveBeenCalled();
    expect(spv.download).not.toHaveBeenCalled();
  });

  it('skips the logo when the company has none', async () => {
    const { service, companies } = setup();
    companies.getLogo.mockRejectedValue(new NotFoundException());
    const files = await unzip((await service.export(1, 7)).content);
    expect(files['logo.png']).toBeUndefined();
    expect(files['erori.txt']).toBeUndefined();
  });

  it('answers 404 before streaming for a missing company', async () => {
    const { service, companies, invoices } = setup();
    companies.get.mockRejectedValue(new NotFoundException());
    await expect(service.export(1, 7)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(invoices.find).not.toHaveBeenCalled();
  });
});
