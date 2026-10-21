import {
  BadRequestException,
  BadGatewayException,
  ConflictException,
} from '@nestjs/common';
import { QueryFailedError, type Repository } from 'typeorm';
import type { AnafConnection } from '../../anaf/anaf-connection.entity.js';
import type { AnafCompanyAccessService } from '../../anaf/services/anaf-company-access.service.js';
import { anafTvaRecord } from '../../testing/anaf-tva-record.js';
import type { AnafCompanyLookupService } from './anaf-company-lookup.service.js';
import { CompaniesService } from './companies.service.js';
import type { Company } from '../company.entity.js';
import type { ActivityLogsService } from '../../api-logs/activity-logs.service.js';
import { ActivityAction } from '../../api-logs/dto/api-log.enums.js';
import { fakeActivityLogs } from '../../testing/activity-logs.js';

function setup({
  save = (c: unknown) => Promise.resolve(c),
  exists = false,
  lookup = () => Promise.resolve(anafTvaRecord()),
  stored,
  existing = [],
  lookupMany = (_: number, cuis: string[]) =>
    Promise.resolve(
      new Map(cuis.map((c) => [Number(c), anafTvaRecord(Number(c))])),
    ),
}: {
  save?: (c: unknown) => Promise<unknown>;
  exists?: boolean;
  lookup?: () => Promise<unknown>;
  stored?: Partial<Company>;
  existing?: string[];
  lookupMany?: (accountantId: number, cuis: string[]) => Promise<unknown>;
} = {}) {
  const companies = {
    existsBy: vi.fn().mockResolvedValue(exists),
    findOneBy: vi.fn().mockResolvedValue(stored ?? null),
    find: vi.fn().mockResolvedValue(existing.map((cui) => ({ cui }))),
    create: vi.fn((data: Partial<Company>) => data),
    save: vi.fn(save),
  };
  const anaf = { lookup: vi.fn(lookup), lookupMany: vi.fn(lookupMany) };
  const activity = fakeActivityLogs();
  const service = new CompaniesService(
    companies as unknown as Repository<Company>,
    {} as Repository<AnafConnection>,
    anaf as unknown as AnafCompanyLookupService,
    {} as AnafCompanyAccessService,
    activity as unknown as ActivityLogsService,
  );
  return { service, companies, anaf, activity };
}

describe('CompaniesService.findByCui', () => {
  it('looks only among the accountant’s companies', async () => {
    const { service, companies } = setup({
      stored: { id: 3, cui: '12345678' },
    });
    expect(await service.findByCui(1, '12345678')).toMatchObject({ id: 3 });
    expect(companies.findOneBy).toHaveBeenCalledWith({
      accountantId: 1,
      cui: '12345678',
    });
  });
});

describe('CompaniesService.create', () => {
  it('fills the company from the ANAF record', async () => {
    const { service, anaf } = setup();
    const company = await service.create(1, { cui: '12345678' });

    expect(anaf.lookup).toHaveBeenCalledWith(1, '12345678');
    expect(company).toMatchObject({
      accountantId: 1,
      cui: '12345678',
      name: 'AGRO VEST SRL',
      regCom: 'J35/100/2010',
      address: 'JUD. TIMIŞ, MUN. TIMIŞOARA, STR. EXEMPLU, NR.1',
      caenCode: '0111',
      registrationStatus: 'INREGISTRAT din data 01.02.2010',
      vatPayer: true,
      vatOnCollection: false,
      splitVat: false,
      eFactura: true,
      inactive: false,
      anafData: anafTvaRecord(),
    });
    expect(company.anafSyncedAt).toBeInstanceOf(Date);
  });

  it('stores blank ANAF strings as null', async () => {
    const { service } = setup({
      lookup: () =>
        Promise.resolve(
          anafTvaRecord(12345678, { nrRegCom: '', cod_CAEN: '  ' }),
        ),
    });
    const company = await service.create(1, { cui: '12345678' });
    expect(company.regCom).toBeNull();
    expect(company.caenCode).toBeNull();
  });

  it('rejects a CUI that ANAF does not know, without saving', async () => {
    const { service, companies } = setup({
      lookup: () => Promise.resolve(null),
    });
    const err = await service
      .create(1, { cui: '12345678' })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(BadRequestException);
    expect((err as Error).message).toMatch(/CUI incorect/);
    expect(companies.save).not.toHaveBeenCalled();
  });

  it('rejects a duplicate before calling ANAF', async () => {
    const { service, anaf } = setup({ exists: true });
    await expect(service.create(1, { cui: '12345678' })).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(anaf.lookup).not.toHaveBeenCalled();
  });

  it('passes ANAF outages through', async () => {
    const { service } = setup({
      lookup: () => Promise.reject(new BadGatewayException('down')),
    });
    await expect(service.create(1, { cui: '12345678' })).rejects.toBeInstanceOf(
      BadGatewayException,
    );
  });

  it('maps a concurrent duplicate CUI to 409', async () => {
    const { service } = setup({
      save: () =>
        Promise.reject(
          new QueryFailedError(
            'INSERT',
            [],
            Object.assign(new Error('dup'), { code: '23505' }),
          ),
        ),
    });
    await expect(service.create(1, { cui: '12345678' })).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('rethrows other database errors', async () => {
    const { service } = setup({
      save: () => Promise.reject(new Error('connection lost')),
    });
    await expect(service.create(1, { cui: '12345678' })).rejects.toThrow(
      'connection lost',
    );
  });
});

describe('CompaniesService activity', () => {
  it('logs a created company with its name and CUI', async () => {
    const { service, activity } = setup({
      save: (c) => Promise.resolve({ ...(c as object), id: 5 }),
    });
    await service.create(1, { cui: '12345678' });
    expect(activity.record).toHaveBeenCalledWith(
      1,
      expect.objectContaining({
        action: ActivityAction.CompanyCreated,
        companyId: 5,
        details: { companyName: 'AGRO VEST SRL', cui: '12345678' },
      }),
    );
  });

  it('logs nothing when ANAF does not know the CUI', async () => {
    const { service, activity } = setup({
      lookup: () => Promise.resolve(null),
    });
    await expect(service.create(1, { cui: '12345678' })).rejects.toThrow();
    expect(activity.record).not.toHaveBeenCalled();
  });

  it('logs only the companies a bulk add created, in one write', async () => {
    const { service, activity } = setup({ existing: ['11'] });
    await service.createMany(1, { cuis: ['11', '22', '33'] });
    expect(activity.recordMany).toHaveBeenCalledOnce();
    const [accountantId, entries] = activity.recordMany.mock.calls[0];
    expect(accountantId).toBe(1);
    expect(
      (entries as { details: { cui: string } }[]).map((e) => e.details.cui),
    ).toEqual(['22', '33']);
  });
});

describe('CompaniesService.refreshFromAnaf', () => {
  const stored = {
    id: 7,
    accountantId: 1,
    cui: '12345678',
    name: 'Agro Vest (client vechi)',
    vatPayer: null,
    anafData: null,
    anafSyncedAt: null,
  } satisfies Partial<Company>;

  it('updates the ANAF fields but keeps the name the accountant chose', async () => {
    const { service, companies, anaf } = setup({ stored: { ...stored } });
    const company = await service.refreshFromAnaf(1, 7);

    expect(companies.findOneBy).toHaveBeenCalledWith({
      id: 7,
      accountantId: 1,
    });
    expect(anaf.lookup).toHaveBeenCalledWith(1, '12345678', 7);
    expect(company.name).toBe('Agro Vest (client vechi)');
    expect(company.vatPayer).toBe(true);
    expect(company.anafData).toEqual(anafTvaRecord());
    expect(company.anafSyncedAt).toBeInstanceOf(Date);
  });

  it('reports a CUI that is no longer in the ANAF database', async () => {
    const { service, companies } = setup({
      stored: { ...stored },
      lookup: () => Promise.resolve(null),
    });
    await expect(service.refreshFromAnaf(1, 7)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(companies.save).not.toHaveBeenCalled();
  });
});

describe('CompaniesService.createMany', () => {
  const dup = () =>
    Promise.reject(
      new QueryFailedError(
        'INSERT',
        [],
        Object.assign(new Error('dup'), { code: '23505' }),
      ),
    );

  it('creates every company ANAF knows, in the order given', async () => {
    const { service, anaf, companies } = setup();
    const results = await service.createMany(1, { cuis: ['22', '11'] });

    expect(anaf.lookupMany).toHaveBeenCalledWith(1, ['22', '11']);
    expect(companies.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ accountantId: 1 }),
      }),
    );
    expect(results.map((r) => [r.cui, r.status])).toEqual([
      ['22', 'created'],
      ['11', 'created'],
    ]);
    expect(results[0]).toMatchObject({
      company: { accountantId: 1, cui: '22', name: 'AGRO VEST SRL' },
    });
  });

  it('skips companies that already exist without calling ANAF for them', async () => {
    const { service, anaf, companies } = setup({ existing: ['11'] });
    const results = await service.createMany(1, { cuis: ['11', '22'] });

    expect(anaf.lookupMany).toHaveBeenCalledWith(1, ['22']);
    expect(companies.save).toHaveBeenCalledTimes(1);
    expect(results.map((r) => r.status)).toEqual(['exists', 'created']);
  });

  it('does not call ANAF when every CUI already exists', async () => {
    const { service, anaf } = setup({ existing: ['11'] });
    const results = await service.createMany(1, { cuis: ['11'] });
    expect(anaf.lookupMany).not.toHaveBeenCalled();
    expect(results).toEqual([{ cui: '11', status: 'exists' }]);
  });

  it('reports CUIs that ANAF does not know', async () => {
    const { service, companies } = setup({
      lookupMany: () => Promise.resolve(new Map([[22, anafTvaRecord(22)]])),
    });
    const results = await service.createMany(1, { cuis: ['11', '22'] });
    expect(results.map((r) => r.status)).toEqual(['not_found', 'created']);
    expect(companies.save).toHaveBeenCalledTimes(1);
  });

  it('drops duplicates, including ones that differ only by leading zeros', async () => {
    const { service, anaf } = setup();
    const results = await service.createMany(1, {
      cuis: ['123', '0123', '123', '45'],
    });
    expect(anaf.lookupMany).toHaveBeenCalledWith(1, ['123', '45']);
    expect(results.map((r) => r.cui)).toEqual(['123', '45']);
  });

  it('maps a concurrent duplicate to exists and keeps going', async () => {
    const save = vi
      .fn()
      .mockImplementationOnce(dup)
      .mockImplementation((c: unknown) => Promise.resolve(c));
    const { service } = setup({ save });
    const results = await service.createMany(1, { cuis: ['11', '22'] });
    expect(results.map((r) => r.status)).toEqual(['exists', 'created']);
  });

  it('rethrows other database errors', async () => {
    const { service } = setup({
      save: () => Promise.reject(new Error('connection lost')),
    });
    await expect(service.createMany(1, { cuis: ['11'] })).rejects.toThrow(
      'connection lost',
    );
  });

  it('saves nothing when ANAF is down', async () => {
    const { service, companies } = setup({
      lookupMany: () => Promise.reject(new BadGatewayException('down')),
    });
    await expect(
      service.createMany(1, { cuis: ['11', '22'] }),
    ).rejects.toBeInstanceOf(BadGatewayException);
    expect(companies.save).not.toHaveBeenCalled();
  });
});
