import { NotFoundException } from '@nestjs/common';
import { strFromU8, unzipSync } from 'fflate';
import type { Readable } from 'node:stream';
import { IsNull, type Repository } from 'typeorm';
import type { AnafConnection } from '../../anaf/anaf-connection.entity.js';
import type { SpvMessage } from '../../anaf/spv/spv-message.entity.js';
import type { Company } from '../../companies/company.entity.js';
import { CompanyExportService } from '../../companies/deletion/company-export.service.js';
import type { CompanyExport } from '../../companies/dto/company.types.js';
import type { ZipStream } from '../../companies/deletion/zip-stream.js';
import type { CompaniesService } from '../../companies/services/companies.service.js';
import type { AccountantsService } from '../services/accountants.service.js';
import { AccountExportService } from './account-export.service.js';
import type { ActivityLogsService } from '../../api-logs/activity-logs.service.js';
import { ActivityAction } from '../../api-logs/dto/api-log.enums.js';
import { fakeActivityLogs } from '../../testing/activity-logs.js';

const COMPANIES = [
  { id: 7, accountantId: 1, cui: '123', name: 'ALFA SRL' },
  { id: 8, accountantId: 1, cui: '456', name: 'BETA SRL' },
] as Company[];

function setup() {
  const accountants = {
    getProfile: vi.fn().mockResolvedValue({ id: 1, email: 'a@b.ro' }),
  };
  const companies = { list: vi.fn().mockResolvedValue(COMPANIES) };
  const companyExport = Object.create(
    CompanyExportService.prototype,
  ) as CompanyExportService;
  const writeCompany = vi.fn(
    (zip: ZipStream, company: Company, prefix: string) => {
      zip.add(`${prefix}firma.json`, JSON.stringify({ cui: company.cui }));
      return Promise.resolve(true);
    },
  );
  Object.assign(companyExport, {
    logger: { error: vi.fn() },
    writeCompany,
    writeSpv: vi.fn(
      (zip: ZipStream, _id: number, messages: SpvMessage[], name: string) => {
        zip.add(`${name}.csv`, messages.map((m) => m.anafMessageId).join(','));
        return Promise.resolve(true);
      },
    ),
  });
  const connections = {
    find: vi.fn().mockResolvedValue([
      {
        id: 4,
        label: 'Token USB',
        certSerial: '4C00',
        roles: ['EFACTURA', 'ETRANSPORT'],
        source: 'self',
        status: 'active',
        accessTokenEnc: 'secret-access',
        refreshTokenEnc: 'secret-refresh',
      },
    ]),
  };
  const messages = {
    find: vi.fn().mockResolvedValue([
      { id: 1, anafMessageId: '900', cif: 'RO123' },
      { id: 2, anafMessageId: '901', cif: '999' },
    ]),
  };
  const activity = fakeActivityLogs();
  const service = new AccountExportService(
    accountants as unknown as AccountantsService,
    companies as unknown as CompaniesService,
    companyExport,
    connections as unknown as Repository<AnafConnection>,
    messages as unknown as Repository<SpvMessage>,
    activity as unknown as ActivityLogsService,
  );
  return { service, accountants, writeCompany, messages, activity };
}

async function unzip(result: CompanyExport): Promise<Record<string, string>> {
  const chunks: Buffer[] = [];
  for await (const chunk of result.content as Readable) {
    chunks.push(chunk as Buffer);
  }
  return Object.fromEntries(
    Object.entries(unzipSync(Buffer.concat(chunks))).map(([n, b]) => [
      n,
      strFromU8(b),
    ]),
  );
}

describe('AccountExportService', () => {
  it('packs the profile, certificates, and one folder per company', async () => {
    const { service } = setup();
    const result = await service.export(1, new Date('2026-10-20T09:00:00Z'));
    expect(result.filename).toBe('cont-spvdirect-export-2026-10-20.zip');
    const files = await unzip(result);
    expect(Object.keys(files).sort()).toEqual([
      'activitate.csv',
      'certificate.csv',
      'cont.json',
      'firme.csv',
      'firme/123/firma.json',
      'firme/456/firma.json',
      'spv-fara-firma.csv',
    ]);
    expect(JSON.parse(files['cont.json'])).toEqual({ id: 1, email: 'a@b.ro' });
    expect(files['firme.csv']).toContain('7;123;ALFA SRL;firme/123;');
  });

  it('logs the export and adds the activity log with the accountant name', async () => {
    const { service, activity } = setup();
    activity.all.mockResolvedValue([
      {
        id: 3,
        action: ActivityAction.InvoiceIssued,
        companyId: 7,
        description:
          'Factura FCT 000001 a fost emisă către BETA SRL: 10,00 RON',
        details: { invoiceId: 9 },
        accountantName: 'Andrei K',
        createdAt: new Date('2026-10-20T08:00:00Z'),
      },
    ]);
    const files = await unzip(await service.export(1));
    expect(activity.record).toHaveBeenCalledWith(1, {
      action: ActivityAction.AccountExported,
      description: 'Exportul complet al contului a fost descărcat (ZIP)',
    });
    expect(files['activitate.csv']).toContain(
      'data;utilizator;operatiune;firma_id;descriere;detalii',
    );
    expect(files['activitate.csv']).toContain(
      '2026-10-20T08:00:00.000Z;Andrei K;invoice.issued;7;Factura FCT 000001 a fost emisă către BETA SRL: 10,00 RON;"{""invoiceId"":9}"',
    );
  });

  it('never puts ANAF tokens in the archive', async () => {
    const { service } = setup();
    const files = await unzip(await service.export(1));
    expect(files['certificate.csv']).toContain(
      '4;Token USB;4C00;EFACTURA,ETRANSPORT;self;active',
    );
    expect(JSON.stringify(files)).not.toContain('secret-');
  });

  it('adds only the SPV messages that match none of the companies', async () => {
    const { service, messages } = setup();
    const files = await unzip(await service.export(1));
    expect(messages.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { accountantId: 1, companyId: IsNull() },
      }),
    );
    expect(files['spv-fara-firma.csv']).toBe('901');
  });

  it('answers 404 before streaming for an unknown account', async () => {
    const { service, accountants, writeCompany } = setup();
    accountants.getProfile.mockRejectedValue(new NotFoundException());
    await expect(service.export(1)).rejects.toBeInstanceOf(NotFoundException);
    expect(writeCompany).not.toHaveBeenCalled();
  });
});
