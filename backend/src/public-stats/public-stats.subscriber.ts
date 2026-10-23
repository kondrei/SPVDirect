import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import type {
  DataSource,
  EntityMetadata,
  EntitySubscriberInterface,
  InsertEvent,
  QueryRunner,
  RemoveEvent,
  SoftRemoveEvent,
  TransactionCommitEvent,
  TransactionRollbackEvent,
  UpdateEvent,
} from 'typeorm';
import { Accountant } from '../accountants/accountant.entity.js';
import { AnafConnection } from '../anaf/anaf-connection.entity.js';
import { SpvMessage } from '../anaf/spv/spv-message.entity.js';
import { Company } from '../companies/company.entity.js';
import { EfacturaUpload } from '../efactura/efactura-upload.entity.js';
import { Invoice } from '../invoices/invoice.entity.js';
import { PublicStatsService } from './public-stats.service.js';

const COUNTED = new Set<unknown>([
  Accountant,
  AnafConnection,
  Company,
  EfacturaUpload,
  Invoice,
  SpvMessage,
]);

const STATUS_COUNTED = new Set<unknown>([Accountant, EfacturaUpload]);

@Injectable()
export class PublicStatsSubscriber implements EntitySubscriberInterface {
  private readonly pending = new WeakSet<QueryRunner>();

  constructor(
    @InjectDataSource() dataSource: DataSource,
    private readonly publicStatsService: PublicStatsService,
  ) {
    dataSource.subscribers.push(this);
  }

  afterInsert(event: InsertEvent<unknown>): void {
    this.changed(event.metadata, event.queryRunner, COUNTED);
  }

  afterUpdate(event: UpdateEvent<unknown>): void {
    this.changed(event.metadata, event.queryRunner, STATUS_COUNTED);
  }

  afterRemove(event: RemoveEvent<unknown>): void {
    this.changed(event.metadata, event.queryRunner, COUNTED);
  }

  afterSoftRemove(event: SoftRemoveEvent<unknown>): void {
    this.changed(event.metadata, event.queryRunner, COUNTED);
  }

  afterTransactionCommit(event: TransactionCommitEvent): void {
    const runner = event.queryRunner;
    if (runner.isTransactionActive || !this.pending.has(runner)) return;
    this.pending.delete(runner);
    this.publicStatsService.invalidate();
  }

  afterTransactionRollback(event: TransactionRollbackEvent): void {
    if (!event.queryRunner.isTransactionActive) {
      this.pending.delete(event.queryRunner);
    }
  }

  private changed(
    metadata: EntityMetadata,
    runner: QueryRunner,
    tracked: Set<unknown>,
  ): void {
    if (!tracked.has(metadata.target)) return;
    if (runner.isTransactionActive) this.pending.add(runner);
    else this.publicStatsService.invalidate();
  }
}
