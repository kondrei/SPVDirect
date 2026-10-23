import {
  IsNull,
  LessThan,
  MoreThan,
  Not,
  type EntityManager,
  type Repository,
} from 'typeorm';
import { Company } from '../company.entity.js';
import { CompanyRepository } from './company.repository.js';

function setup(rows: object[] = []) {
  const repo = {
    find: vi.fn().mockResolvedValue(rows),
    update: vi.fn().mockResolvedValue({ affected: 1 }),
  };
  const manager = {
    find: vi.fn().mockResolvedValue(rows),
    softDelete: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue({}),
  };
  const companies = new CompanyRepository(
    repo as unknown as Repository<Company>,
  );
  return {
    companies,
    repo,
    manager: manager as typeof manager & EntityManager,
  };
}

describe('CompanyRepository.lockLive', () => {
  it('locks every live company of the accountant in id order', async () => {
    const { companies, manager } = setup([{ id: 3 }, { id: 7 }]);
    const ids = await companies.lockLive(manager, 1);
    expect(ids).toEqual([3, 7]);
    expect(manager.find).toHaveBeenCalledWith(Company, {
      select: { id: true },
      where: { accountantId: 1 },
      order: { id: 'ASC' },
      lock: { mode: 'pessimistic_write' },
    });
  });

  it('narrows the lock to one company', async () => {
    const { companies, manager } = setup([{ id: 7 }]);
    await companies.lockLive(manager, 1, 7);
    expect(manager.find).toHaveBeenCalledWith(
      Company,
      expect.objectContaining({ where: { accountantId: 1, id: 7 } }),
    );
  });
});

describe('CompanyRepository batches', () => {
  it('pages through companies with a certificate after the last id', async () => {
    const { companies, repo } = setup();
    await companies.certifiedAfter(40, 50);
    expect(repo.find).toHaveBeenCalledWith({
      select: { id: true, accountantId: true, name: true, cui: true },
      where: { id: MoreThan(40), anafConnectionId: Not(IsNull()) },
      order: { id: 'ASC' },
      take: 50,
    });
  });

  it('pages through companies deleted before the cutoff, deleted rows included', async () => {
    const { companies, repo } = setup();
    const cutoff = new Date('2026-09-01T00:00:00Z');
    await companies.deletedBefore(cutoff, 10, 50);
    expect(repo.find).toHaveBeenCalledWith({
      select: { id: true, accountantId: true },
      where: { id: MoreThan(10), deletedAt: LessThan(cutoff) },
      withDeleted: true,
      order: { id: 'ASC' },
      take: 50,
    });
  });
});

describe('CompanyRepository writes', () => {
  it('updates one company by id', async () => {
    const { companies, repo } = setup();
    await companies.update(7, { logo: null, logoContentType: null });
    expect(repo.update).toHaveBeenCalledWith(
      { id: 7 },
      { logo: null, logoContentType: null },
    );
  });

  it('soft-deletes and purges inside the given transaction', async () => {
    const { companies, manager } = setup();
    await companies.softDelete(manager, 7);
    await companies.softDeleteOfAccountant(manager, 1);
    await companies.purge(manager, 7);
    expect(manager.softDelete).toHaveBeenNthCalledWith(1, Company, { id: 7 });
    expect(manager.softDelete).toHaveBeenNthCalledWith(2, Company, {
      accountantId: 1,
    });
    expect(manager.delete).toHaveBeenCalledWith(Company, { id: 7 });
  });
});
