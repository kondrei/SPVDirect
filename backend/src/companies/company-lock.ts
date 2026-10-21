import { NotFoundException } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { Company } from './company.entity.js';

export async function lockLiveCompanies(
  manager: EntityManager,
  accountantId: number,
  companyId?: number,
): Promise<number[]> {
  const companies = await manager.find(Company, {
    select: { id: true },
    where: { accountantId, ...(companyId ? { id: companyId } : {}) },
    order: { id: 'ASC' },
    lock: { mode: 'pessimistic_write' },
  });
  return companies.map((c) => c.id);
}

export async function lockLiveCompany(
  manager: EntityManager,
  accountantId: number,
  companyId: number,
): Promise<void> {
  if (!(await lockLiveCompanies(manager, accountantId, companyId)).length) {
    throw new NotFoundException('Firma nu a fost găsită');
  }
}
