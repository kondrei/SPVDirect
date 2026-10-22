import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, type SelectQueryBuilder } from 'typeorm';
import { Accountant } from '../accountants/accountant.entity.js';
import { ApiLogStream } from './api-log-stream.js';
import { ApiLog } from './api-log.entity.js';
import { SYSTEM_ACTOR_NAME } from './dto/api-log.constants.js';
import { ApiLogMethod, ApiLogService } from './dto/api-log.enums.js';
import type {
  ActivityEntry,
  ActivityFilter,
  ActivityItem,
  ActivityPage,
  ActivityRow,
  ApiLogRow,
  JobEntry,
} from './dto/api-log.types.js';

@Injectable()
export class ActivityLogsService {
  private readonly logger = new Logger(ActivityLogsService.name);

  constructor(
    @InjectRepository(ApiLog) private readonly logs: Repository<ApiLog>,
    private readonly stream: ApiLogStream,
  ) {}

  record(accountantId: number, entry: ActivityEntry): Promise<void> {
    return this.recordMany(accountantId, [entry]);
  }

  recordMany(accountantId: number, entries: ActivityEntry[]): Promise<void> {
    return this.insert(accountantId, entries);
  }

  recordJob(entry: JobEntry): Promise<void> {
    return this.insert(null, [entry]);
  }

  private async insert(
    accountantId: number | null,
    entries: (ActivityEntry | JobEntry)[],
  ): Promise<void> {
    if (!entries.length) return;
    const rows: ApiLogRow[] = entries.map((entry) => ({
      accountantId,
      anafConnectionId: null,
      companyId: 'companyId' in entry ? (entry.companyId ?? null) : null,
      service: ApiLogService.Activity,
      method: ApiLogMethod.Log,
      endpoint: entry.action,
      statusCode: null,
      responseTimeMs: null,
      error: 'error' in entry ? (entry.error ?? null) : null,
      description: entry.description,
      details: entry.details ?? {},
    }));
    for (const row of rows) this.stream.write(row);
    try {
      await this.logs.insert(rows);
    } catch (err) {
      this.logger.error(
        `Could not write activity to api_logs (${entries.map((e) => e.action).join(', ')}): ${String(err)}`,
      );
    }
  }

  async list(
    accountantId: number,
    filter: ActivityFilter,
  ): Promise<ActivityPage> {
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
    return {
      items: rows.map((row) => toItem(row)),
      total,
      page: filter.page,
      pageSize: filter.pageSize,
    };
  }

  async all(accountantId: number): Promise<ActivityItem[]> {
    const rows = await this.select(
      this.activityOf(accountantId),
      'ASC',
    ).getRawMany<ActivityRow>();
    return rows.map((row) => toItem(row));
  }

  private activityOf(accountantId: number): SelectQueryBuilder<ApiLog> {
    return this.logs
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

function toItem(row: ActivityRow): ActivityItem {
  return {
    id: Number(row.id),
    action: row.action,
    companyId: row.companyId === null ? null : Number(row.companyId),
    description: row.description ?? '',
    details: row.details ?? {},
    accountantName: row.details?.job
      ? SYSTEM_ACTOR_NAME
      : (row.accountantName ?? ''),
    createdAt: new Date(row.createdAt),
  };
}
