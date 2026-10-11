import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { QueryFailedError, type Repository } from 'typeorm';
import type { AnafConnection } from '../../anaf/anaf-connection.entity.js';
import type { Company } from '../company.entity.js';
import type { AnafCompanyLookupService } from './anaf-company-lookup.service.js';
import { CompaniesService } from './companies.service.js';

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);

function setup({
  stored = { id: 7, accountantId: 1, name: 'AGRO', logoContentType: null },
  withLogo,
  remove = () => Promise.resolve(),
}: {
  stored?: Partial<Company> | null;
  withLogo?: Partial<Company> | null;
  remove?: () => Promise<unknown>;
} = {}) {
  const getOne = vi.fn().mockResolvedValue(withLogo ?? null);
  const builder = {
    addSelect: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    getOne,
  };
  const companies = {
    findOneBy: vi.fn().mockResolvedValue(stored),
    save: vi.fn((c: unknown) => Promise.resolve(c)),
    update: vi.fn().mockResolvedValue({}),
    remove: vi.fn(remove),
    createQueryBuilder: vi.fn().mockReturnValue(builder),
  };
  const service = new CompaniesService(
    companies as unknown as Repository<Company>,
    {} as Repository<AnafConnection>,
    {} as AnafCompanyLookupService,
  );
  return { service, companies, builder };
}

describe('CompaniesService.update invoicing details', () => {
  it('saves the IBAN, bank, email and phone used on invoices', async () => {
    const { service, companies } = setup();
    await service.update(1, 7, {
      iban: 'RO49AAAA1B31007593840000',
      bankName: 'Banca X',
      email: 'a@b.ro',
      phone: '0700',
    });
    expect(companies.save).toHaveBeenCalledWith(
      expect.objectContaining({
        iban: 'RO49AAAA1B31007593840000',
        bankName: 'Banca X',
        email: 'a@b.ro',
        phone: '0700',
      }),
    );
  });

  it('clears a detail sent as null and leaves the others alone', async () => {
    const { service, companies } = setup({
      stored: { id: 7, accountantId: 1, iban: 'RO12', email: 'a@b.ro' },
    });
    await service.update(1, 7, { iban: null });
    expect(companies.save).toHaveBeenCalledWith(
      expect.objectContaining({ iban: null, email: 'a@b.ro' }),
    );
  });
});

describe('CompaniesService logo', () => {
  it('stores a valid logo for the accountant company', async () => {
    const { service, companies } = setup();
    const company = await service.setLogo(1, 7, PNG);
    expect(companies.findOneBy).toHaveBeenCalledWith({
      id: 7,
      accountantId: 1,
    });
    expect(companies.update).toHaveBeenCalledWith(
      { id: 7 },
      { logo: PNG, logoContentType: 'image/png' },
    );
    expect(company.logoContentType).toBe('image/png');
  });

  it('rejects an invalid logo before touching the database', async () => {
    const { service, companies } = setup();
    await expect(
      service.setLogo(1, 7, Buffer.from('<svg/>')),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(companies.update).not.toHaveBeenCalled();
  });

  it('does not store a logo for another accountant company', async () => {
    const { service, companies } = setup({ stored: null });
    await expect(service.setLogo(2, 7, PNG)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(companies.update).not.toHaveBeenCalled();
  });

  it('reads the logo scoped to the accountant', async () => {
    const { service, builder } = setup({
      withLogo: { id: 7, logo: PNG, logoContentType: 'image/png' },
    });
    await expect(service.getLogo(1, 7)).resolves.toEqual({
      content: PNG,
      contentType: 'image/png',
    });
    expect(builder.where).toHaveBeenCalledWith(
      'c.id = :id AND c.accountantId = :accountantId',
      { id: 7, accountantId: 1 },
    );
  });

  it('answers 404 when there is no logo', async () => {
    const { service } = setup({
      withLogo: { id: 7, logo: null, logoContentType: null },
    });
    await expect(service.getLogo(1, 7)).rejects.toThrow('nu are logo');
  });

  it('removes the logo', async () => {
    const { service, companies } = setup({
      stored: { id: 7, accountantId: 1, logoContentType: 'image/png' },
    });
    const company = await service.removeLogo(1, 7);
    expect(companies.update).toHaveBeenCalledWith(
      { id: 7 },
      { logo: null, logoContentType: null },
    );
    expect(company.logoContentType).toBeNull();
  });
});

describe('CompaniesService.remove', () => {
  it('keeps a company that has issued invoices', async () => {
    const { service } = setup({
      remove: () =>
        Promise.reject(
          new QueryFailedError('DELETE', [], {
            code: '23503',
          } as unknown as Error),
        ),
    });
    await expect(service.remove(1, 7)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('rethrows other database errors', async () => {
    const { service } = setup({
      remove: () => Promise.reject(new Error('down')),
    });
    await expect(service.remove(1, 7)).rejects.toThrow('down');
  });
});
