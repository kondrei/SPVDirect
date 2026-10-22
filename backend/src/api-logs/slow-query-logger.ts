import { Logger } from '@nestjs/common';
import {
  AbstractLogger,
  type LogLevel,
  type LogMessage,
  type QueryRunner,
} from 'typeorm';
import { ApiLog } from './api-log.entity.js';
import {
  API_LOG_INSERT,
  MAX_SLOW_QUERY_LENGTH,
  SLOW_QUERY_SAVE_LIMIT,
  SLOW_QUERY_SAVE_WINDOW_MS,
} from './dto/api-log.constants.js';
import { ApiLogMethod, ApiLogService } from './dto/api-log.enums.js';
import type { ApiLogRow } from './dto/api-log.types.js';

export function slowQueryText(query: string): string {
  return query.replaceAll(/\s+/g, ' ').trim().slice(0, MAX_SLOW_QUERY_LENGTH);
}

export class SlowQueryLogger extends AbstractLogger {
  private readonly logger = new Logger('ApiLog');
  private readonly typeorm = new Logger('TypeORM');
  private windowStart = 0;
  private saved = 0;

  constructor(private readonly now: () => number = Date.now) {
    super(['warn']);
  }

  override logQuerySlow(
    time: number,
    query: string,
    _parameters?: unknown,
    queryRunner?: QueryRunner,
  ): void {
    const row: ApiLogRow = {
      accountantId: null,
      anafConnectionId: null,
      companyId: null,
      service: ApiLogService.Database,
      method: ApiLogMethod.Query,
      endpoint: slowQueryText(query),
      statusCode: null,
      responseTimeMs: Math.round(time),
      error: null,
      details: {},
    };
    this.logger.warn({
      message: `${ApiLogService.Database} ${ApiLogMethod.Query} slow (${row.responseTimeMs} ms)`,
      ...row,
    });
    if (!queryRunner || API_LOG_INSERT.test(query) || !this.claimSave()) {
      return;
    }
    queryRunner.dataSource
      .getRepository(ApiLog)
      .insert(row)
      .catch((err: unknown) => {
        const reason = err instanceof Error ? err.message : 'unknown error';
        this.typeorm.error(`Could not save slow query: ${reason}`);
      });
  }

  protected writeLog(
    level: LogLevel,
    message: LogMessage | string | number | (LogMessage | string | number)[],
  ): void {
    const text = this.prepareLogMessages(message)
      .map((m) => String(m.message))
      .join(' ');
    if (level === 'warn') this.typeorm.warn(text);
    else this.typeorm.log(text);
  }

  private claimSave(): boolean {
    const now = this.now();
    if (now - this.windowStart >= SLOW_QUERY_SAVE_WINDOW_MS) {
      this.windowStart = now;
      this.saved = 0;
    }
    if (this.saved >= SLOW_QUERY_SAVE_LIMIT) return false;
    this.saved += 1;
    return true;
  }
}
