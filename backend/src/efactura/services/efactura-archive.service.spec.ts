import {
  BadRequestException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { QueryFailedError, type Repository } from 'typeorm';
import type { ActivityLogsService } from '../../api-logs/activity-logs.service.js';
import { ActivityAction } from '../../api-logs/dto/api-log.enums.js';
import type { AnafApiService } from '../../anaf/services/anaf-api.service.js';
import type { Company } from '../../companies/company.entity.js';
import type { CompaniesService } from '../../companies/services/companies.service.js';
import { fakeActivityLogs } from '../../testing/activity-logs.js';
import {
  BUYER_CUI,
  SELLER_CUI,
  anafZip,
  ciiInvoice,
  ublCreditNote,
  ublInvoice,
} from '../../testing/efactura-fixtures.js';
import {
  NOT_AN_INVOICE,
  NOT_A_PARTY,
  NO_CERTIFICATE,
  PDF_ONLY_UBL,
} from '../dto/efactura.constants.js';
import {
  EfacturaDirection,
  EfacturaStandard,
  ImportStatus,
  ValidateStandard,
} from '../dto/efactura.enums.js';
import type { EfacturaInvoice } from '../efactura-invoice.entity.js';
import type { EfacturaUpload } from '../efactura-upload.entity.js';
import type { EfacturaArchiveMailer } from './efactura-archive-mailer.service.js';
import { EfacturaArchiveService } from './efactura-archive.service.js';
import type { EfacturaFileStore } from './efactura-file-store.service.js';
import type { EfacturaValidator } from './efactura-validator.service.js';
import type { EfacturaService } from './efactura.service.js';

const BUYER = {
  id: 7,
  accountantId: 1,
  cui: BUYER_CUI,
  name: 'BETA SRL',
  anafConnectionId: 3,
} as Company;

const SELLER = Object.assign({}, BUYER, {
  cui: SELLER_CUI,
  name: 'ALFA SRL',
}) as Company;

function zipFile(content: Buffer) {
  return {
    content,
    contentType: 'application/zip',
    filename: 'efactura-1.zip',
  };
}

function storedRow(overrides: Partial<EfacturaInvoice> = {}): EfacturaInvoice {
  return {
    id: 31,
    accountantId: 1,
    companyId: 7,
    anafConnectionId: 3,
    environment: 'prod',
    anafMessageId: '3001',
    uploadIndex: '5001120362',
    messageCreatedAt: null,
    direction: EfacturaDirection.Received,
    standard: EfacturaStandard.UBL,
    typeCode: '380',
    number: 'FCT-0042',
    issueDate: '2026-10-02',
    dueDate: null,
    currency: 'RON',
    supplierCui: SELLER_CUI,
    supplierName: 'ALFA SRL',
    customerCui: BUYER_CUI,
    customerName: 'BETA SRL',
    totalNet: 100,
    totalVat: 21,
    totalGross: 121,
    lines: [],
    parseError: null,
    invoiceId: null,
    zipContent: anafZip(ublInvoice()),
    zipStoragePath: null,
    pdfContent: null,
    pdfStoragePath: null,
    createdAt: new Date('2026-10-03T00:00:00Z'),
    deletedAt: null,
    ...overrides,
  } as EfacturaInvoice;
}

function setup({
  company = BUYER,
  storage = false,
}: { company?: Company; storage?: boolean } = {}) {
  const builder = {
    where: vi.fn().mockReturnThis(),
    andWhere: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    addSelect: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    addOrderBy: vi.fn().mockReturnThis(),
    skip: vi.fn().mockReturnThis(),
    take: vi.fn().mockReturnThis(),
    groupBy: vi.fn().mockReturnThis(),
    setParameters: vi.fn().mockReturnThis(),
    getManyAndCount: vi.fn().mockResolvedValue([[storedRow()], 1]),
    getRawMany: vi.fn().mockResolvedValue([]),
    getOne: vi.fn().mockResolvedValue(storedRow()),
  };
  const saved: Partial<EfacturaInvoice>[] = [];
  const txRepo = {
    save: vi.fn((row: Partial<EfacturaInvoice>) => {
      saved.push(row);
      return Promise.resolve({ ...row, id: 40 + saved.length });
    }),
  };
  const tx = {
    find: vi.fn().mockResolvedValue([{ id: 7 }]),
    getRepository: vi.fn(() => txRepo),
  };
  const archive = {
    findOne: vi.fn().mockResolvedValue(null),
    find: vi.fn().mockResolvedValue([]),
    create: vi.fn((data: Partial<EfacturaInvoice>) => ({ ...data })),
    update: vi.fn().mockResolvedValue({ affected: 1 }),
    createQueryBuilder: vi.fn(() => builder),
    manager: {
      transaction: vi.fn((work: (m: typeof tx) => unknown) => work(tx)),
    },
  };
  const uploads = { findOne: vi.fn().mockResolvedValue(null) };
  const efactura = {
    fetchMessages: vi.fn(),
    fetchZip: vi.fn().mockResolvedValue(zipFile(anafZip(ublInvoice()))),
  };
  const api = { environment: vi.fn(() => 'prod') };
  const validator = {
    transform: vi.fn().mockResolvedValue({
      content: Buffer.from('%PDF-1'),
      contentType: 'application/pdf',
      filename: 'factura.pdf',
    }),
  };
  const companies = { get: vi.fn().mockResolvedValue(company) };
  const files = {
    enabled: storage,
    configured: storage,
    pathFor: vi.fn(
      (row: { anafMessageId: string }, kind: string) =>
        `1/7/prod/${row.anafMessageId}.${kind}`,
    ),
    put: vi.fn().mockResolvedValue(undefined),
    get: vi.fn().mockResolvedValue(Buffer.from('from-storage')),
    remove: vi.fn().mockResolvedValue(undefined),
  };
  const mailer = { send: vi.fn().mockResolvedValue(undefined) };
  const activity = fakeActivityLogs();
  const service = new EfacturaArchiveService(
    efactura as unknown as EfacturaService,
    api as unknown as AnafApiService,
    validator as unknown as EfacturaValidator,
    companies as unknown as CompaniesService,
    files as unknown as EfacturaFileStore,
    mailer as unknown as EfacturaArchiveMailer,
    archive as unknown as Repository<EfacturaInvoice>,
    uploads as unknown as Repository<EfacturaUpload>,
    activity as unknown as ActivityLogsService,
  );
  return {
    service,
    builder,
    saved,
    tx,
    archive,
    uploads,
    efactura,
    validator,
    files,
    mailer,
    activity,
  };
}

function uniqueViolation() {
  return new QueryFailedError('INSERT', [], {
    code: '23505',
  } as unknown as Error);
}

describe('EfacturaArchiveService.importMessages', () => {
  it('downloads a received invoice once and stores the signed ZIP with the parsed header', async () => {
    const { service, efactura, saved, tx } = setup();
    const results = await service.importMessages(1, 7, ['3001']);
    expect(results).toEqual([
      { messageId: '3001', status: ImportStatus.Imported, id: 41 },
    ]);
    expect(efactura.fetchZip).toHaveBeenCalledWith(
      { accountantId: 1, connectionId: 3, companyId: 7 },
      'prod',
      '3001',
    );
    expect(tx.find).toHaveBeenCalled();
    expect(saved[0]).toMatchObject({
      accountantId: 1,
      companyId: 7,
      anafConnectionId: 3,
      environment: 'prod',
      anafMessageId: '3001',
      uploadIndex: '5001120362',
      direction: EfacturaDirection.Received,
      standard: EfacturaStandard.UBL,
      number: 'FCT-0042',
      supplierCui: SELLER_CUI,
      customerCui: BUYER_CUI,
      totalGross: 121,
      invoiceId: null,
      zipStoragePath: null,
      parseError: null,
    });
    expect(Buffer.isBuffer(saved[0].zipContent)).toBe(true);
  });

  it('links an invoice the company sent from SPVDirect through its upload index', async () => {
    const { service, uploads, saved } = setup({ company: SELLER });
    uploads.findOne.mockResolvedValue({ id: 5, invoiceId: 11 });
    await service.importMessages(1, 7, ['3001']);
    expect(uploads.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { companyId: 7, environment: 'prod', uploadIndex: '5001120362' },
      }),
    );
    expect(saved[0]).toMatchObject({
      direction: EfacturaDirection.Sent,
      invoiceId: 11,
    });
  });

  it('does not download a message that is already archived', async () => {
    const { service, archive, efactura } = setup();
    archive.findOne.mockResolvedValue({ id: 9 });
    expect(await service.importMessages(1, 7, ['3001'])).toEqual([
      { messageId: '3001', status: ImportStatus.Already, id: 9 },
    ]);
    expect(efactura.fetchZip).not.toHaveBeenCalled();
  });

  it('skips an error message and an invoice the company is not part of', async () => {
    const { service, efactura, saved } = setup();
    efactura.fetchZip
      .mockResolvedValueOnce(
        zipFile(anafZip('<header><Error errorMessage="E"/></header>')),
      )
      .mockResolvedValueOnce(zipFile(anafZip(ublInvoice({ buyer: '999' }))));
    expect(await service.importMessages(1, 7, ['1', '2'])).toEqual([
      { messageId: '1', status: ImportStatus.Skipped, reason: NOT_AN_INVOICE },
      { messageId: '2', status: ImportStatus.Skipped, reason: NOT_A_PARTY },
    ]);
    expect(saved).toEqual([]);
  });

  it('reports an ANAF refusal for one message and keeps going', async () => {
    const { service, efactura } = setup();
    efactura.fetchZip.mockRejectedValueOnce(
      new BadRequestException('Nu aveti dreptul sa descarcati mesajul'),
    );
    const results = await service.importMessages(1, 7, ['1', '2']);
    expect(results).toEqual([
      {
        messageId: '1',
        status: ImportStatus.Failed,
        reason: 'Nu aveti dreptul sa descarcati mesajul',
      },
      { messageId: '2', status: ImportStatus.Imported, id: 41 },
    ]);
  });

  it('stops calling ANAF after it becomes unavailable', async () => {
    const { service, efactura } = setup();
    efactura.fetchZip.mockRejectedValueOnce(
      new ServiceUnavailableException('ANAF indisponibil'),
    );
    const results = await service.importMessages(1, 7, ['1', '2']);
    expect(results.map((r) => [r.status, r.reason])).toEqual([
      [ImportStatus.Failed, 'ANAF indisponibil'],
      [ImportStatus.Failed, 'ANAF indisponibil'],
    ]);
    expect(efactura.fetchZip).toHaveBeenCalledOnce();
  });

  it('answers already when a concurrent import won the unique index', async () => {
    const { service, tx } = setup();
    tx.getRepository.mockReturnValue({
      save: vi.fn().mockRejectedValue(uniqueViolation()),
    });
    expect(await service.importMessages(1, 7, ['3001'])).toEqual([
      { messageId: '3001', status: ImportStatus.Already },
    ]);
  });

  it('puts the ZIP in Supabase Storage when EFACTURA_STORAGE is supabase', async () => {
    const { service, files, saved } = setup({ storage: true });
    await service.importMessages(1, 7, ['3001']);
    expect(files.put).toHaveBeenCalledWith(
      '1/7/prod/3001.zip',
      expect.any(Buffer),
      'application/zip',
    );
    expect(saved[0]).toMatchObject({
      zipStoragePath: '1/7/prod/3001.zip',
      zipContent: null,
    });
  });

  it('removes the stored ZIP when the company was deleted meanwhile', async () => {
    const { service, files, tx } = setup({ storage: true });
    tx.find.mockResolvedValue([]);
    const results = await service.importMessages(1, 7, ['3001']);
    expect(results[0]).toMatchObject({
      status: ImportStatus.Failed,
      reason: 'Firma nu a fost găsită',
    });
    expect(files.remove).toHaveBeenCalledWith(['1/7/prod/3001.zip']);
  });

  it('keeps the stored ZIP when a concurrent import already saved the row', async () => {
    const { service, files, tx } = setup({ storage: true });
    tx.getRepository.mockReturnValue({
      save: vi.fn().mockRejectedValue(uniqueViolation()),
    });
    await service.importMessages(1, 7, ['3001']);
    expect(files.remove).not.toHaveBeenCalled();
  });

  it('needs a certificate on the company', async () => {
    const { service } = setup({
      company: Object.assign({}, BUYER, { anafConnectionId: null }) as Company,
    });
    await expect(service.importMessages(1, 7, ['3001'])).rejects.toThrow(
      NO_CERTIFICATE,
    );
  });

  it('logs what it imported and nothing when nothing changed', async () => {
    const { service, activity, archive } = setup();
    await service.importMessages(1, 7, ['3001']);
    expect(activity.record).toHaveBeenCalledWith(
      1,
      expect.objectContaining({
        action: ActivityAction.EfacturaArchiveImported,
        companyId: 7,
        details: expect.objectContaining({ imported: 1, automatic: false }),
      }),
    );
    activity.record.mockClear();
    archive.findOne.mockResolvedValue({ id: 9 });
    await service.importMessages(1, 7, ['3001']);
    expect(activity.record).not.toHaveBeenCalled();
  });
});

describe('EfacturaArchiveService.importPeriod', () => {
  function message(id: string, tip: string) {
    return {
      id,
      type: tip,
      requestId: `9${id}`,
      createdAt: '2026-10-02T08:00:00.000Z',
    };
  }

  it('walks the paginated list, imports only new invoices and says how many are left', async () => {
    const { service, efactura, builder, saved } = setup();
    efactura.fetchMessages
      .mockResolvedValueOnce({
        messages: [
          message('1', 'FACTURA PRIMITA'),
          message('2', 'ERORI FACTURA'),
        ],
        pages: 2,
      })
      .mockResolvedValueOnce({
        messages: [message('3', 'FACTURA PRIMITA')],
        pages: 2,
      });
    builder.getRawMany.mockResolvedValueOnce([{ anafMessageId: '3' }]);
    const now = Date.now();
    const result = await service.importPeriod(1, 7, 60);

    expect(efactura.fetchMessages).toHaveBeenCalledTimes(2);
    const [, cui, query] = efactura.fetchMessages.mock.calls[1] as [
      unknown,
      string,
      { startTime: number; endTime: number; pagina: number },
    ];
    expect(cui).toBe(BUYER_CUI);
    expect(query.pagina).toBe(2);
    expect(query.endTime).toBeGreaterThanOrEqual(now);
    expect(query.endTime - query.startTime).toBeLessThan(60 * 24 * 3600_000);
    expect(result).toEqual({
      found: 2,
      remaining: 0,
      results: [{ messageId: '1', status: ImportStatus.Imported, id: 41 }],
    });
    expect(saved[0]).toMatchObject({
      uploadIndex: '91',
      messageCreatedAt: new Date('2026-10-02T08:00:00.000Z'),
    });
  });

  it('imports at most one batch per call', async () => {
    const { service, efactura } = setup();
    efactura.fetchMessages.mockResolvedValue({
      messages: Array.from({ length: 53 }, (_, i) =>
        message(String(i + 1), 'FACTURA PRIMITA'),
      ),
      pages: 1,
    });
    const result = await service.importPeriod(1, 7, 10);
    expect(result.results).toHaveLength(50);
    expect(result.remaining).toBe(3);
  });
});

describe('EfacturaArchiveService.list', () => {
  it('filters by company, direction, period and an escaped search, and adds the totals per currency', async () => {
    const { service, builder } = setup();
    builder.getRawMany.mockResolvedValueOnce([
      { currency: 'RON', count: '2', total: '242.00' },
    ]);
    const page = await service.list(1, {
      companyId: 7,
      direction: EfacturaDirection.Received,
      from: '2026-10-01',
      to: '2026-10-31',
      q: 'RO 1%',
      page: 2,
      pageSize: 10,
    });
    expect(builder.where).toHaveBeenCalledWith(
      'e.accountantId = :accountantId',
      {
        accountantId: 1,
      },
    );
    expect(builder.andWhere).toHaveBeenCalledWith('e.companyId = :companyId', {
      companyId: 7,
    });
    expect(builder.andWhere).toHaveBeenCalledWith('e.direction = :direction', {
      direction: 'received',
    });
    expect(builder.andWhere).toHaveBeenCalledWith('e.issueDate >= :from', {
      from: '2026-10-01',
    });
    expect(builder.skip).toHaveBeenCalledWith(10);
    expect(builder.take).toHaveBeenCalledWith(10);
    expect(page.totals).toEqual([{ currency: 'RON', count: 2, total: 242 }]);
    expect(page.items[0]).toMatchObject({
      id: 31,
      creditNote: false,
      number: 'FCT-0042',
    });
    expect(page.items[0]).not.toHaveProperty('zipContent');
    expect(page.items[0]).not.toHaveProperty('zipStoragePath');
  });
});

describe('EfacturaArchiveService files', () => {
  it('answers 404 for an invoice of another accountant', async () => {
    const { service, builder } = setup();
    builder.getOne.mockResolvedValue(null);
    await expect(service.get(2, 31)).rejects.toBeInstanceOf(NotFoundException);
    expect(builder.where).toHaveBeenCalledWith(
      'e.id = :id AND e.accountantId = :accountantId',
      { id: 31, accountantId: 2 },
    );
  });

  it('serves the original ZIP and the invoice XML from it', async () => {
    const { service } = setup();
    const zip = await service.zip(1, 31);
    expect(zip.filename).toBe('factura-FCT-0042-3001.zip');
    const xml = await service.xml(1, 31);
    expect(xml.content.toString('utf8')).toBe(ublInvoice());
    expect(xml.contentType).toBe('application/xml');
  });

  it('reads a ZIP kept in Storage', async () => {
    const { service, builder, files } = setup({ storage: true });
    builder.getOne.mockResolvedValue(
      storedRow({ zipContent: null, zipStoragePath: '1/7/prod/3001.zip' }),
    );
    const zip = await service.zip(1, 31);
    expect(files.get).toHaveBeenCalledWith('1/7/prod/3001.zip');
    expect(zip.content.toString()).toBe('from-storage');
  });

  it('makes the PDF at ANAF once, without validation, and caches it', async () => {
    const { service, validator, archive } = setup();
    const pdf = await service.pdf(1, 31);
    expect(validator.transform).toHaveBeenCalledWith(
      1,
      ublInvoice(),
      ValidateStandard.FACT1,
      true,
    );
    expect(archive.update).toHaveBeenCalledWith(
      { id: 31 },
      { pdfContent: pdf.content },
    );
    expect(pdf.filename).toBe('factura-FCT-0042-3001.pdf');
  });

  it('serves a cached PDF without calling ANAF', async () => {
    const { service, builder, validator } = setup();
    builder.getOne.mockResolvedValue(
      storedRow({ pdfContent: Buffer.from('%PDF-cached') }),
    );
    expect((await service.pdf(1, 31)).content.toString()).toBe('%PDF-cached');
    expect(validator.transform).not.toHaveBeenCalled();
  });

  it('uses the credit note standard and refuses CII', async () => {
    const { service, builder, validator } = setup();
    builder.getOne.mockResolvedValueOnce(
      storedRow({
        standard: EfacturaStandard.CN,
        zipContent: anafZip(ublCreditNote()),
      }),
    );
    await service.pdf(1, 31);
    expect(validator.transform).toHaveBeenCalledWith(
      1,
      ublCreditNote(),
      ValidateStandard.FCN,
      true,
    );
    builder.getOne.mockResolvedValueOnce(
      storedRow({
        standard: EfacturaStandard.CII,
        zipContent: anafZip(ciiInvoice()),
      }),
    );
    await expect(service.pdf(1, 31)).rejects.toThrow(PDF_ONLY_UBL);
  });
});

describe('EfacturaArchiveService.email', () => {
  it('sends the PDF and the original ZIP and logs it', async () => {
    const { service, mailer, activity } = setup();
    const result = await service.email(1, 31, {
      to: 'client@example.com',
      message: 'Pentru contabilitate',
    });
    expect(result).toEqual({ to: 'client@example.com', withPdf: true });
    const [row, to, note, attachments] = mailer.send.mock.calls[0] as [
      EfacturaInvoice,
      string,
      string,
      { filename: string }[],
    ];
    expect(row.id).toBe(31);
    expect(to).toBe('client@example.com');
    expect(note).toBe('Pentru contabilitate');
    expect(attachments.map((a) => a.filename)).toEqual([
      'factura-FCT-0042-3001.pdf',
      'factura-FCT-0042-3001.zip',
    ]);
    expect(activity.record).toHaveBeenCalledWith(
      1,
      expect.objectContaining({
        action: ActivityAction.EfacturaArchiveEmailed,
        companyId: 7,
      }),
    );
  });

  it('still sends the ZIP when no PDF can be made', async () => {
    const { service, builder, mailer } = setup();
    builder.getOne.mockResolvedValue(
      storedRow({
        standard: EfacturaStandard.CII,
        zipContent: anafZip(ciiInvoice()),
      }),
    );
    expect(await service.email(1, 31, { to: 'a@b.ro' })).toEqual({
      to: 'a@b.ro',
      withPdf: false,
    });
    const attachments = mailer.send.mock.calls[0][3] as { filename: string }[];
    expect(attachments).toHaveLength(1);
  });

  it('logs nothing when the email fails', async () => {
    const { service, mailer, activity } = setup();
    mailer.send.mockRejectedValue(new Error('SMTP down'));
    await expect(service.email(1, 31, { to: 'a@b.ro' })).rejects.toThrow(
      'SMTP down',
    );
    expect(activity.record).not.toHaveBeenCalled();
  });
});
