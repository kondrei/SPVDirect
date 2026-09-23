import { ConflictException } from '@nestjs/common';
import { QueryFailedError, type Repository } from 'typeorm';
import type { AnafConnection } from '../anaf/anaf-connection.entity.js';
import { CompaniesService } from './companies.service.js';
import type { Company } from './company.entity.js';

function setup(save: () => Promise<unknown>) {
  const companies = {
    existsBy: vi.fn().mockResolvedValue(false),
    create: vi.fn((data: Partial<Company>) => data),
    save: vi.fn(save),
  } as unknown as Repository<Company>;
  return new CompaniesService(companies, {} as Repository<AnafConnection>);
}

describe('CompaniesService.create', () => {
  it('maps a concurrent duplicate CUI to 409', async () => {
    const service = setup(() =>
      Promise.reject(
        new QueryFailedError(
          'INSERT',
          [],
          Object.assign(new Error('dup'), {
            code: '23505',
          }),
        ),
      ),
    );
    await expect(
      service.create('acc-1', { cui: '12345678', name: 'Firma' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rethrows other database errors', async () => {
    const service = setup(() => Promise.reject(new Error('connection lost')));
    await expect(
      service.create('acc-1', { cui: '12345678', name: 'Firma' }),
    ).rejects.toThrow('connection lost');
  });
});
