import { NotFoundException } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { lockLiveCompanies, lockLiveCompany } from './company-lock.js';
import { Company } from './company.entity.js';

function manager(rows: { id: number }[]) {
  return { find: vi.fn().mockResolvedValue(rows) };
}

describe('lockLiveCompanies', () => {
  it('locks every live company of the accountant in id order', async () => {
    const m = manager([{ id: 3 }, { id: 7 }]);
    const ids = await lockLiveCompanies(m as unknown as EntityManager, 1);
    expect(ids).toEqual([3, 7]);
    expect(m.find).toHaveBeenCalledWith(Company, {
      select: { id: true },
      where: { accountantId: 1 },
      order: { id: 'ASC' },
      lock: { mode: 'pessimistic_write' },
    });
  });

  it('narrows the lock to one company', async () => {
    const m = manager([{ id: 7 }]);
    await lockLiveCompanies(m as unknown as EntityManager, 1, 7);
    expect(m.find).toHaveBeenCalledWith(
      Company,
      expect.objectContaining({ where: { accountantId: 1, id: 7 } }),
    );
  });
});

describe('lockLiveCompany', () => {
  it('answers 404 when the company is gone or deleted', async () => {
    const m = manager([]);
    await expect(
      lockLiveCompany(m as unknown as EntityManager, 1, 7),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
