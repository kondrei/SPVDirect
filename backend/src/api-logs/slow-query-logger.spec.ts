import { Logger } from '@nestjs/common';
import type { QueryRunner } from 'typeorm';
import { buildTypeOrmOptions } from '../config/typeorm.config.js';
import { ApiLog } from './api-log.entity.js';
import {
  MAX_SLOW_QUERY_LENGTH,
  SLOW_QUERY_SAVE_LIMIT,
  SLOW_QUERY_SAVE_WINDOW_MS,
} from './dto/api-log.constants.js';
import { ApiLogMethod, ApiLogService } from './dto/api-log.enums.js';
import { SlowQueryLogger, slowQueryText } from './slow-query-logger.js';

const QUERY = `SELECT "c"."id" FROM "companies" "c"
  WHERE "c"."accountant_id" = $1`;

function setup(now = () => 0) {
  const insert = vi.fn().mockResolvedValue(undefined);
  const getRepository = vi.fn().mockReturnValue({ insert });
  const runner = { dataSource: { getRepository } } as unknown as QueryRunner;
  const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
  const error = vi
    .spyOn(Logger.prototype, 'error')
    .mockImplementation(() => {});
  return {
    logger: new SlowQueryLogger(now),
    runner,
    insert,
    getRepository,
    warn,
    error,
  };
}

describe('SlowQueryLogger', () => {
  afterEach(() => vi.restoreAllMocks());

  it('logs and saves a slow query without its parameters', () => {
    const { logger, runner, insert, getRepository, warn } = setup();
    logger.logQuerySlow(1534.6, QUERY, ['secret-hash'], runner);
    const row = {
      accountantId: null,
      anafConnectionId: null,
      companyId: null,
      service: ApiLogService.Database,
      method: ApiLogMethod.Query,
      endpoint:
        'SELECT "c"."id" FROM "companies" "c" WHERE "c"."accountant_id" = $1',
      statusCode: null,
      responseTimeMs: 1535,
      error: null,
      details: {},
    };
    expect(getRepository).toHaveBeenCalledWith(ApiLog);
    expect(insert).toHaveBeenCalledWith(row);
    expect(warn).toHaveBeenCalledWith({
      message: 'DB QUERY slow (1535 ms)',
      ...row,
    });
    expect(JSON.stringify([warn.mock.calls, insert.mock.calls])).not.toContain(
      'secret-hash',
    );
  });

  it('never saves a slow insert into api_logs, so it cannot feed itself', () => {
    const { logger, runner, insert, warn } = setup();
    logger.logQuerySlow(
      2000,
      'INSERT INTO "api_logs"("service") VALUES ($1)',
      [],
      runner,
    );
    expect(warn).toHaveBeenCalledOnce();
    expect(insert).not.toHaveBeenCalled();
  });

  it('saves at most the limit per window and logs the rest', () => {
    let now = 0;
    const { logger, runner, insert, warn } = setup(() => now);
    for (let i = 0; i <= SLOW_QUERY_SAVE_LIMIT; i++) {
      logger.logQuerySlow(1500, QUERY, [], runner);
    }
    expect(insert).toHaveBeenCalledTimes(SLOW_QUERY_SAVE_LIMIT);
    expect(warn).toHaveBeenCalledTimes(SLOW_QUERY_SAVE_LIMIT + 1);
    now = SLOW_QUERY_SAVE_WINDOW_MS;
    logger.logQuerySlow(1500, QUERY, [], runner);
    expect(insert).toHaveBeenCalledTimes(SLOW_QUERY_SAVE_LIMIT + 1);
  });

  it('only logs when the insert fails, and never throws into the query', async () => {
    const { logger, runner, insert, error } = setup();
    insert.mockRejectedValueOnce(new Error('db down'));
    logger.logQuerySlow(1500, QUERY, [], runner);
    await vi.waitFor(() =>
      expect(error).toHaveBeenCalledWith('Could not save slow query: db down'),
    );
  });

  it('only logs when there is no query runner', () => {
    const { logger, warn } = setup();
    expect(() => logger.logQuerySlow(1500, QUERY)).not.toThrow();
    expect(warn).toHaveBeenCalledOnce();
  });

  it('forwards TypeORM warnings but never failed queries with their parameters', () => {
    const { logger, warn, error } = setup();
    logger.log('warn', 'pool is full');
    logger.logQueryError('boom', QUERY, ['secret-hash']);
    logger.logQuery(QUERY, ['secret-hash']);
    expect(warn).toHaveBeenCalledWith('pool is full');
    expect(error).not.toHaveBeenCalled();
    expect(JSON.stringify(warn.mock.calls)).not.toContain('secret-hash');
  });
});

describe('slowQueryText', () => {
  it('collapses whitespace and cuts long queries', () => {
    expect(slowQueryText('  SELECT\n  1 ')).toBe('SELECT 1');
    expect(slowQueryText('x'.repeat(MAX_SLOW_QUERY_LENGTH + 5))).toHaveLength(
      MAX_SLOW_QUERY_LENGTH,
    );
  });
});

describe('buildTypeOrmOptions', () => {
  const base = { DATABASE_URL: 'postgresql://u:p@h/db', DATABASE_SSL: false };

  it('turns on the slow query logger with the threshold', () => {
    const options = buildTypeOrmOptions({ ...base, DB_SLOW_QUERY_MS: 800 });
    expect(options.maxQueryExecutionTime).toBe(800);
    expect(options.logger).toBeInstanceOf(SlowQueryLogger);
  });

  it('leaves it off at 0 and for the migration CLI', () => {
    for (const options of [
      buildTypeOrmOptions({ ...base, DB_SLOW_QUERY_MS: 0 }),
      buildTypeOrmOptions(base),
    ]) {
      expect(options.maxQueryExecutionTime).toBeUndefined();
      expect(options.logger).toBeUndefined();
    }
  });
});
