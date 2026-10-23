import { NotFoundException } from '@nestjs/common';
import type { EntityManager, Repository } from 'typeorm';
import { lockLiveCompany } from './company-lock.js';
import type { Company } from './company.entity.js';
import { CompanyRepository } from './repositories/company.repository.js';

function manager(rows: { id: number }[]) {
  return { find: vi.fn().mockResolvedValue(rows) };
}

const companies = new CompanyRepository({} as Repository<Company>);

describe('lockLiveCompany', () => {
  it('locks the live company of the accountant', async () => {
    const m = manager([{ id: 7 }]);
    await lockLiveCompany(companies, m as unknown as EntityManager, 1, 7);
    expect(m.find).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ where: { accountantId: 1, id: 7 } }),
    );
  });

  it('answers 404 when the company is gone or deleted', async () => {
    const m = manager([]);
    await expect(
      lockLiveCompany(companies, m as unknown as EntityManager, 1, 7),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
