import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  In,
  IsNull,
  LessThan,
  MoreThan,
  Not,
  Repository,
  type EntityManager,
} from 'typeorm';
import { Company } from '../company.entity.js';
import type { CompanyChanges } from '../dto/company.types.js';

@Injectable()
export class CompanyRepository {
  constructor(
    @InjectRepository(Company)
    private readonly companyRepository: Repository<Company>,
  ) {}

  create(data: Partial<Company>): Company {
    return this.companyRepository.create(data);
  }

  save(company: Company): Promise<Company> {
    return this.companyRepository.save(company);
  }

  async update(id: number, changes: CompanyChanges): Promise<void> {
    await this.companyRepository.update({ id }, changes);
  }

  listByName(accountantId: number): Promise<Company[]> {
    return this.companyRepository.find({
      where: { accountantId },
      order: { name: 'ASC' },
    });
  }

  findOwned(accountantId: number, id: number): Promise<Company | null> {
    return this.companyRepository.findOneBy({ id, accountantId });
  }

  findByCui(accountantId: number, cui: string): Promise<Company | null> {
    return this.companyRepository.findOneBy({ accountantId, cui });
  }

  existsByCui(accountantId: number, cui: string): Promise<boolean> {
    return this.companyRepository.existsBy({ accountantId, cui });
  }

  withCuis(
    accountantId: number,
    cuis: string[],
  ): Promise<Pick<Company, 'id' | 'cui'>[]> {
    return this.companyRepository.find({
      select: { id: true, cui: true },
      where: { accountantId, cui: In(cuis) },
    });
  }

  existingCuis(
    accountantId: number,
    cuis: string[],
  ): Promise<Pick<Company, 'cui'>[]> {
    return this.companyRepository.find({
      select: { cui: true },
      where: { accountantId, cui: In(cuis) },
    });
  }

  findWithLogo(accountantId: number, id: number): Promise<Company | null> {
    return this.companyRepository
      .createQueryBuilder('c')
      .addSelect('c.logo')
      .where('c.id = :id AND c.accountantId = :accountantId', {
        id,
        accountantId,
      })
      .getOne();
  }

  certifiedAfter(
    afterId: number,
    take: number,
  ): Promise<Pick<Company, 'id' | 'accountantId' | 'name' | 'cui'>[]> {
    return this.companyRepository.find({
      select: { id: true, accountantId: true, name: true, cui: true },
      where: { id: MoreThan(afterId), anafConnectionId: Not(IsNull()) },
      order: { id: 'ASC' },
      take,
    });
  }

  count(): Promise<number> {
    return this.companyRepository.count();
  }

  async lockLive(
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

  async softDelete(manager: EntityManager, id: number): Promise<void> {
    await manager.softDelete(Company, { id });
  }

  async softDeleteOfAccountant(
    manager: EntityManager,
    accountantId: number,
  ): Promise<void> {
    await manager.softDelete(Company, { accountantId });
  }

  async purge(manager: EntityManager, id: number): Promise<void> {
    await manager.delete(Company, { id });
  }

  deletedBefore(
    cutoff: Date,
    afterId: number,
    take: number,
  ): Promise<Pick<Company, 'id' | 'accountantId'>[]> {
    return this.companyRepository.find({
      select: { id: true, accountantId: true },
      where: { id: MoreThan(afterId), deletedAt: LessThan(cutoff) },
      withDeleted: true,
      order: { id: 'ASC' },
      take,
    });
  }

  idsOfAccountantWithDeleted(
    accountantId: number,
  ): Promise<Pick<Company, 'id'>[]> {
    return this.companyRepository.find({
      select: { id: true },
      where: { accountantId },
      withDeleted: true,
    });
  }
}
