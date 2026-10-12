import type { DataSource, EntityMetadata, QueryRunner } from 'typeorm';
import { Accountant } from '../accountants/accountant.entity.js';
import { ApiLog } from '../api-logs/api-log.entity.js';
import { Company } from '../companies/company.entity.js';
import { Invoice } from '../invoices/invoice.entity.js';
import type { PublicStatsService } from './public-stats.service.js';
import { PublicStatsSubscriber } from './public-stats.subscriber.js';

function setup() {
  const dataSource = { subscribers: [] as unknown[] };
  const stats = { invalidate: vi.fn() };
  const subscriber = new PublicStatsSubscriber(
    dataSource as unknown as DataSource,
    stats as unknown as PublicStatsService,
  );
  return { dataSource, stats, subscriber };
}

function runner(isTransactionActive: boolean) {
  return { isTransactionActive } as QueryRunner;
}

function event(target: unknown, queryRunner: QueryRunner) {
  return {
    metadata: { target } as EntityMetadata,
    queryRunner,
  } as never;
}

describe('PublicStatsSubscriber', () => {
  it('registers itself on the data source', () => {
    const { dataSource, subscriber } = setup();
    expect(dataSource.subscribers).toContain(subscriber);
  });

  it('invalidates right away for a write outside a transaction', () => {
    const { stats, subscriber } = setup();
    subscriber.afterInsert(event(Invoice, runner(false)));
    expect(stats.invalidate).toHaveBeenCalledOnce();
  });

  it('waits for the commit when the write is inside a transaction', () => {
    const { stats, subscriber } = setup();
    const qr = runner(true);
    subscriber.afterInsert(event(Invoice, qr));
    expect(stats.invalidate).not.toHaveBeenCalled();
    subscriber.afterTransactionCommit({ queryRunner: qr } as never);
    expect(stats.invalidate).not.toHaveBeenCalled();
    (qr as { isTransactionActive: boolean }).isTransactionActive = false;
    subscriber.afterTransactionCommit({ queryRunner: qr } as never);
    subscriber.afterTransactionCommit({ queryRunner: qr } as never);
    expect(stats.invalidate).toHaveBeenCalledOnce();
  });

  it('forgets the change when the transaction rolls back', () => {
    const { stats, subscriber } = setup();
    const qr = runner(true);
    subscriber.afterRemove(event(Company, qr));
    (qr as { isTransactionActive: boolean }).isTransactionActive = false;
    subscriber.afterTransactionRollback({ queryRunner: qr } as never);
    subscriber.afterTransactionCommit({ queryRunner: qr } as never);
    expect(stats.invalidate).not.toHaveBeenCalled();
  });

  it('ignores tables that are not counted', () => {
    const { stats, subscriber } = setup();
    subscriber.afterInsert(event(ApiLog, runner(false)));
    expect(stats.invalidate).not.toHaveBeenCalled();
  });

  it('reacts to updates only where a status is counted', () => {
    const { stats, subscriber } = setup();
    subscriber.afterUpdate(event(Company, runner(false)));
    expect(stats.invalidate).not.toHaveBeenCalled();
    subscriber.afterUpdate(event(Accountant, runner(false)));
    expect(stats.invalidate).toHaveBeenCalledOnce();
  });
});
