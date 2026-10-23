import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  In,
  IsNull,
  MoreThanOrEqual,
  Not,
  Repository,
  type EntityManager,
  type SelectQueryBuilder,
} from 'typeorm';
import { Company } from '../../companies/company.entity.js';
import { Invoice } from '../invoice.entity.js';
import type {
  InvoiceChanges,
  InvoiceListFilter,
} from '../dto/invoice.types.js';

@Injectable()
export class InvoiceRepository {
  constructor(
    @InjectRepository(Invoice)
    private readonly invoiceRepository: Repository<Invoice>,
  ) {}

  create(data: Partial<Invoice>): Invoice {
    return this.invoiceRepository.create(data);
  }

  save(manager: EntityManager, invoice: Invoice): Promise<Invoice> {
    return manager.getRepository(Invoice).save(invoice);
  }

  async update(id: number, changes: InvoiceChanges): Promise<void> {
    await this.invoiceRepository.update({ id }, changes);
  }

  findOwned(accountantId: number, id: number): Promise<Invoice | null> {
    return this.invoiceRepository.findOneBy({ id, accountantId });
  }

  existsOwned(
    manager: EntityManager,
    accountantId: number,
    id: number,
  ): Promise<boolean> {
    return manager.existsBy(Invoice, { id, accountantId });
  }

  findRef(
    manager: EntityManager,
    accountantId: number,
    id: number,
  ): Promise<Pick<Invoice, 'id' | 'companyId'> | null> {
    return manager.getRepository(Invoice).findOne({
      select: { id: true, companyId: true },
      where: { id, accountantId },
    });
  }

  findForUpdate(
    manager: EntityManager,
    accountantId: number,
    id: number,
  ): Promise<Invoice | null> {
    return manager.getRepository(Invoice).findOne({
      where: { id, accountantId },
      lock: { mode: 'pessimistic_write' },
    });
  }

  stornosOf(
    accountantId: number,
    id: number,
    manager?: EntityManager,
  ): Promise<Invoice[]> {
    return (manager?.getRepository(Invoice) ?? this.invoiceRepository).findBy({
      accountantId,
      stornoOfInvoiceId: id,
    });
  }

  page(
    accountantId: number,
    filter: InvoiceListFilter,
  ): Promise<[Invoice[], number]> {
    return this.invoiceRepository.findAndCount({
      where: {
        accountantId,
        ...(filter.companyId ? { companyId: filter.companyId } : {}),
      },
      order: { issueDate: 'DESC', id: 'DESC' },
      skip: (filter.page - 1) * filter.pageSize,
      take: filter.pageSize,
    });
  }

  stornoTargets(
    accountantId: number,
    ids: number[],
  ): Promise<Pick<Invoice, 'stornoOfInvoiceId'>[]> {
    return this.invoiceRepository.find({
      select: { stornoOfInvoiceId: true },
      where: { accountantId, stornoOfInvoiceId: In(ids) },
    });
  }

  issuedSince(accountantId: number, from: string): Promise<Invoice[]> {
    return this.invoiceRepository.find({
      select: {
        issueDate: true,
        currency: true,
        exchangeRate: true,
        totalNet: true,
        totalVatRon: true,
        stornoOfInvoiceId: true,
      },
      where: { accountantId, issueDate: MoreThanOrEqual(from) },
    });
  }

  forCompany(accountantId: number, companyId: number): Promise<Invoice[]> {
    return this.invoiceRepository.find({
      where: { accountantId, companyId },
      order: { issueDate: 'ASC', id: 'ASC' },
    });
  }

  latestBuyer(
    accountantId: number,
    buyerCui: string,
  ): Promise<Pick<Invoice, 'id' | 'buyer'> | null> {
    return this.toBuyer(accountantId, buyerCui)
      .select(['invoice.id', 'invoice.buyer'])
      .limit(1)
      .getOne();
  }

  recentToBuyer(
    accountantId: number,
    companyId: number,
    buyerCui: string,
    limit: number,
  ): Promise<Invoice[]> {
    return this.toBuyer(accountantId, buyerCui)
      .select([
        'invoice.id',
        'invoice.lines',
        'invoice.currency',
        'invoice.issueDate',
      ])
      .andWhere('invoice.companyId = :companyId', { companyId })
      .limit(limit)
      .getMany();
  }

  async highestNumber(
    companyId: number,
    series: string,
    manager?: EntityManager,
  ): Promise<number> {
    const invoices = manager?.getRepository(Invoice) ?? this.invoiceRepository;
    const [own, earlier] = await Promise.all([
      invoices.maximum('number', { companyId, series }),
      this.earlier(invoices, companyId, series)
        .select('MAX(i.number)', 'max')
        .getRawOne<{ max: number | string | null }>(),
    ]);
    return Math.max(own ?? 0, Number(earlier?.max ?? 0));
  }

  numberUsedEarlier(
    manager: EntityManager,
    companyId: number,
    series: string,
    number: number,
  ): Promise<boolean> {
    return this.earlier(manager.getRepository(Invoice), companyId, series)
      .andWhere('i.number = :number', { number })
      .getExists();
  }

  count(): Promise<number> {
    return this.invoiceRepository.count();
  }

  async softDeleteOfCompany(
    manager: EntityManager,
    companyId: number,
  ): Promise<void> {
    await manager.softDelete(Invoice, { companyId });
  }

  async softDeleteOfAccountant(
    manager: EntityManager,
    accountantId: number,
  ): Promise<void> {
    await manager.softDelete(Invoice, { accountantId });
  }

  storedOfCompany(
    companyId: number,
  ): Promise<Pick<Invoice, 'id' | 'storagePath'>[]> {
    return this.invoiceRepository.find({
      select: { id: true, storagePath: true },
      where: { companyId, storagePath: Not(IsNull()) },
      withDeleted: true,
    });
  }

  async purgeCompany(manager: EntityManager, companyId: number): Promise<void> {
    await manager.delete(Invoice, {
      companyId,
      stornoOfInvoiceId: Not(IsNull()),
    });
    await manager.delete(Invoice, { companyId });
  }

  private toBuyer(
    accountantId: number,
    buyerCui: string,
  ): SelectQueryBuilder<Invoice> {
    return this.invoiceRepository
      .createQueryBuilder('invoice')
      .where('invoice.accountantId = :accountantId', { accountantId })
      .andWhere("invoice.buyer ->> 'cui' = :buyerCui", { buyerCui })
      .andWhere('invoice.stornoOfInvoiceId IS NULL')
      .orderBy('invoice.issueDate', 'DESC')
      .addOrderBy('invoice.id', 'DESC');
  }

  private earlier(
    invoices: Repository<Invoice>,
    companyId: number,
    series: string,
  ): SelectQueryBuilder<Invoice> {
    return invoices.manager
      .createQueryBuilder(Invoice, 'i')
      .withDeleted()
      .innerJoin(Company, 'c', 'c.id = i.companyId')
      .innerJoin(
        Company,
        'self',
        'self.id = :companyId AND self.id <> c.id AND self.accountantId = c.accountantId AND self.cui = c.cui',
        { companyId },
      )
      .where('i.series = :series', { series });
  }
}
