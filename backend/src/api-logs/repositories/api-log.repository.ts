import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  In,
  Repository,
  type EntityManager,
  type SelectQueryBuilder,
} from 'typeorm';
import { Accountant } from '../../accountants/accountant.entity.js';
import { ApiLog } from '../api-log.entity.js';
import { ApiLogService } from '../dto/api-log.enums.js';
import type {
  ActivityFilter,
  ActivityRow,
  ApiLogEntry,
  ApiLogRow,
} from '../dto/api-log.types.js';

@Injectable()
export class ApiLogRepository {
  constructor(
    @InjectRepository(ApiLog)
    private readonly apiLogRepository: Repository<ApiLog>,
  ) {}

  async insert(rows: ApiLogEntry | ApiLogRow[]): Promise<void> {
    await this.apiLogRepository.insert(rows);
  }

  async purgeCompanyActivity(
    manager: EntityManager,
    companyId: number,
  ): Promise<void> {
    await manager.delete(ApiLog, {
      companyId,
      service: In([ApiLogService.Activity, ApiLogService.Smtp]),
    });
  }

  async activityPage(
    accountantId: number,
    filter: ActivityFilter,
  ): Promise<{ rows: ActivityRow[]; total: number }> {
    const qb = this.activityOf(accountantId);
    if (filter.companyId) {
      qb.andWhere('l.companyId = :companyId', { companyId: filter.companyId });
    }
    if (filter.action) {
      qb.andWhere('l.endpoint = :action', { action: filter.action });
    }
    const total = await qb.getCount();
    const rows = await this.select(qb, 'DESC')
      .offset((filter.page - 1) * filter.pageSize)
      .limit(filter.pageSize)
      .getRawMany<ActivityRow>();
    return { rows, total };
  }

  allActivity(accountantId: number): Promise<ActivityRow[]> {
    return this.select(
      this.activityOf(accountantId),
      'ASC',
    ).getRawMany<ActivityRow>();
  }

  private activityOf(accountantId: number): SelectQueryBuilder<ApiLog> {
    return this.apiLogRepository
      .createQueryBuilder('l')
      .leftJoin(Accountant, 'a', 'a.id = l.accountantId')
      .where('l.accountantId = :accountantId', { accountantId })
      .andWhere('l.service = :service', { service: ApiLogService.Activity });
  }

  private select(
    qb: SelectQueryBuilder<ApiLog>,
    order: 'ASC' | 'DESC',
  ): SelectQueryBuilder<ApiLog> {
    return qb
      .select('l.id', 'id')
      .addSelect('l.endpoint', 'action')
      .addSelect('l.company_id', 'companyId')
      .addSelect('l.description', 'description')
      .addSelect('l.details', 'details')
      .addSelect('l.created_at', 'createdAt')
      .addSelect(
        `COALESCE(NULLIF(TRIM(a.name), ''), a.email::text)`,
        'accountantName',
      )
      .orderBy('l.created_at', order)
      .addOrderBy('l.id', order);
  }
}
