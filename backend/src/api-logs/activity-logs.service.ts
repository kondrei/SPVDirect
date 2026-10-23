import { Injectable, Logger } from '@nestjs/common';
import { ApiLogStream } from './api-log-stream.js';
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
import { ApiLogRepository } from './repositories/api-log.repository.js';

@Injectable()
export class ActivityLogsService {
  private readonly logger = new Logger(ActivityLogsService.name);

  constructor(
    private readonly apiLogRepository: ApiLogRepository,
    private readonly apiLogStream: ApiLogStream,
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
    for (const row of rows) this.apiLogStream.write(row);
    try {
      await this.apiLogRepository.insert(rows);
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
    const { rows, total } = await this.apiLogRepository.activityPage(
      accountantId,
      filter,
    );
    return {
      items: rows.map((row) => toItem(row)),
      total,
      page: filter.page,
      pageSize: filter.pageSize,
    };
  }

  async all(accountantId: number): Promise<ActivityItem[]> {
    const rows = await this.apiLogRepository.allActivity(accountantId);
    return rows.map((row) => toItem(row));
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
