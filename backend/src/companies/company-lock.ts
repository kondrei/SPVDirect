import { NotFoundException } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import type { CompanyRepository } from './repositories/company.repository.js';

export async function lockLiveCompany(
  companies: CompanyRepository,
  manager: EntityManager,
  accountantId: number,
  companyId: number,
): Promise<void> {
  if (!(await companies.lockLive(manager, accountantId, companyId)).length) {
    throw new NotFoundException('Firma nu a fost găsită');
  }
}
