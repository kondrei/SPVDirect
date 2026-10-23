import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Brackets,
  In,
  Repository,
  type EntityManager,
  type SelectQueryBuilder,
} from 'typeorm';
import { ARCHIVE_LIST_COLUMNS } from '../dto/efactura.constants.js';
import { EfacturaStandard, EinvoiceTypeCode } from '../dto/efactura.enums.js';
import type {
  ArchiveFilter,
  ArchiveTotalRow,
  EfacturaInvoiceChanges,
} from '../dto/efactura.types.js';
import { EfacturaInvoice } from '../efactura-invoice.entity.js';
import { likePattern } from '../helpers/archive-view.js';
import { normalizeTaxId } from '../helpers/einvoice-parser.js';

@Injectable()
export class EfacturaInvoiceRepository {
  constructor(
    @InjectRepository(EfacturaInvoice)
    private readonly efacturaInvoiceRepository: Repository<EfacturaInvoice>,
  ) {}

  create(data: Partial<EfacturaInvoice>): EfacturaInvoice {
    return this.efacturaInvoiceRepository.create(data);
  }

  insert(
    manager: EntityManager,
    row: EfacturaInvoice,
  ): Promise<EfacturaInvoice> {
    return manager.getRepository(EfacturaInvoice).save(row);
  }

  async update(id: number, changes: EfacturaInvoiceChanges): Promise<void> {
    await this.efacturaInvoiceRepository.update({ id }, changes);
  }

  findOwned(
    accountantId: number,
    id: number,
    withFiles = false,
  ): Promise<EfacturaInvoice | null> {
    const qb = this.efacturaInvoiceRepository
      .createQueryBuilder('e')
      .where('e.id = :id AND e.accountantId = :accountantId', {
        id,
        accountantId,
      });
    if (withFiles) qb.addSelect(['e.zipContent', 'e.pdfContent']);
    return qb.getOne();
  }

  findIdByMessage(
    companyId: number,
    environment: EfacturaInvoice['environment'],
    anafMessageId: string,
  ): Promise<Pick<EfacturaInvoice, 'id'> | null> {
    return this.efacturaInvoiceRepository.findOne({
      select: { id: true },
      where: { companyId, environment, anafMessageId },
    });
  }

  idsByMessage(
    companyId: number,
    environment: EfacturaInvoice['environment'],
    anafMessageIds: string[],
  ): Promise<Pick<EfacturaInvoice, 'id' | 'anafMessageId'>[]> {
    return this.efacturaInvoiceRepository.find({
      select: { id: true, anafMessageId: true },
      where: { companyId, environment, anafMessageId: In(anafMessageIds) },
    });
  }

  async archivedMessageIds(
    companyId: number,
    environment: EfacturaInvoice['environment'],
    messageIds: string[],
  ): Promise<string[]> {
    const rows = await this.efacturaInvoiceRepository
      .createQueryBuilder('e')
      .select('e.anafMessageId', 'anafMessageId')
      .where('e.companyId = :companyId', { companyId })
      .andWhere('e.environment = :environment', { environment })
      .andWhere('e.anafMessageId IN (:...messageIds)', { messageIds })
      .getRawMany<{ anafMessageId: string }>();
    return rows.map((r) => r.anafMessageId);
  }

  forCompany(
    accountantId: number,
    companyId: number,
  ): Promise<EfacturaInvoice[]> {
    return this.efacturaInvoiceRepository.find({
      where: { accountantId, companyId },
      order: { issueDate: 'ASC', id: 'ASC' },
    });
  }

  page(
    accountantId: number,
    filter: ArchiveFilter,
  ): Promise<[EfacturaInvoice[], number]> {
    return this.filtered(accountantId, filter)
      .select(ARCHIVE_LIST_COLUMNS.map((column) => `e.${column}`))
      .orderBy('e.issueDate', 'DESC', 'NULLS LAST')
      .addOrderBy('e.id', 'DESC')
      .skip((filter.page - 1) * filter.pageSize)
      .take(filter.pageSize)
      .getManyAndCount();
  }

  totals(
    accountantId: number,
    filter: ArchiveFilter,
  ): Promise<ArchiveTotalRow[]> {
    return this.filtered(accountantId, filter)
      .select('e.currency', 'currency')
      .addSelect('COUNT(*)', 'count')
      .addSelect(
        `SUM(CASE WHEN "e"."standard" = :creditStandard OR "e"."type_code" = :creditCode THEN -"e"."total_gross" ELSE "e"."total_gross" END)`,
        'total',
      )
      .setParameters({
        creditStandard: EfacturaStandard.CN,
        creditCode: EinvoiceTypeCode.CreditNote,
      })
      .andWhere('e.currency IS NOT NULL')
      .groupBy('e.currency')
      .orderBy('e.currency', 'ASC')
      .getRawMany<ArchiveTotalRow>();
  }

  storedOfCompany(
    companyId: number,
  ): Promise<
    Pick<EfacturaInvoice, 'id' | 'zipStoragePath' | 'pdfStoragePath'>[]
  > {
    return this.efacturaInvoiceRepository.find({
      select: { id: true, zipStoragePath: true, pdfStoragePath: true },
      where: { companyId },
      withDeleted: true,
    });
  }

  async softDeleteOfCompany(
    manager: EntityManager,
    companyId: number,
  ): Promise<void> {
    await manager.softDelete(EfacturaInvoice, { companyId });
  }

  async softDeleteOfAccountant(
    manager: EntityManager,
    accountantId: number,
  ): Promise<void> {
    await manager.softDelete(EfacturaInvoice, { accountantId });
  }

  async purgeCompany(manager: EntityManager, companyId: number): Promise<void> {
    await manager.delete(EfacturaInvoice, { companyId });
  }

  private filtered(
    accountantId: number,
    filter: ArchiveFilter,
  ): SelectQueryBuilder<EfacturaInvoice> {
    const qb = this.efacturaInvoiceRepository
      .createQueryBuilder('e')
      .where('e.accountantId = :accountantId', { accountantId });
    if (filter.companyId) {
      qb.andWhere('e.companyId = :companyId', { companyId: filter.companyId });
    }
    if (filter.direction) {
      qb.andWhere('e.direction = :direction', { direction: filter.direction });
    }
    if (filter.from) qb.andWhere('e.issueDate >= :from', { from: filter.from });
    if (filter.to) qb.andWhere('e.issueDate <= :to', { to: filter.to });
    const search = filter.q?.trim();
    if (search) {
      const q = likePattern(search);
      const cui = likePattern(normalizeTaxId(search) ?? search);
      qb.andWhere(
        new Brackets((b) =>
          b
            .where('e.number ILIKE :q', { q })
            .orWhere('e.supplierName ILIKE :q', { q })
            .orWhere('e.customerName ILIKE :q', { q })
            .orWhere('e.supplierCui ILIKE :cui', { cui })
            .orWhere('e.customerCui ILIKE :cui', { cui }),
        ),
      );
    }
    return qb;
  }
}
