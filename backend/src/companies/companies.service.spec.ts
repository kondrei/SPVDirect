import {
  BadRequestException,
  BadGatewayException,
  ConflictException,
} from '@nestjs/common';
import { QueryFailedError, type Repository } from 'typeorm';
import type { AnafConnection } from '../anaf/anaf-connection.entity.js';
import { anafTvaRecord } from '../testing/anaf-tva-record.js';
import type { AnafCompanyLookupService } from './anaf-company-lookup.service.js';
import { CompaniesService } from './companies.service.js';
import type { Company } from './company.entity.js';

function setup({
  save = (c: unknown) => Promise.resolve(c),
  exists = false,
  lookup = () => Promise.resolve(anafTvaRecord()),
  stored,
}: {
  save?: (c: unknown) => Promise<unknown>;
  exists?: boolean;
  lookup?: () => Promise<unknown>;
  stored?: Partial<Company>;
} = {}) {
  const companies = {
    existsBy: vi.fn().mockResolvedValue(exists),
    findOneBy: vi.fn().mockResolvedValue(stored ?? null),
    create: vi.fn((data: Partial<Company>) => data),
    save: vi.fn(save),
  };
  const anaf = { lookup: vi.fn(lookup) };
  const service = new CompaniesService(
    companies as unknown as Repository<Company>,
    {} as Repository<AnafConnection>,
    anaf as unknown as AnafCompanyLookupService,
  );
  return { service, companies, anaf };
}

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
