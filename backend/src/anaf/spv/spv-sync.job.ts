import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThan, Repository } from 'typeorm';
import { AnafConnection } from '../anaf-connection.entity.js';
import {
  DEFAULT_SYNC_DAYS,
  SpvArchiveService,
} from './services/spv-archive.service.js';

export const SYNC_SCHEDULE = '0 03 * * *';
export const MAX_MOVE_BATCHES = 10;

@Injectable()
export class SpvSyncJob {
  private readonly logger = new Logger(SpvSyncJob.name);
  private running = false;

  constructor(
    private readonly archive: SpvArchiveService,
    @InjectRepository(AnafConnection)
    private readonly connections: Repository<AnafConnection>,
  ) {}

  @Cron(SYNC_SCHEDULE, { timeZone: 'Europe/Bucharest' })
  async run(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const active = await this.connections.find({
        select: { id: true, accountantId: true },
        where: { status: 'active', refreshExpiresAt: MoreThan(new Date()) },
        order: { id: 'ASC' },
      });
      for (const { id, accountantId } of active) {
        try {
          await this.archive.sync(accountantId, id, DEFAULT_SYNC_DAYS);
        } catch (err) {
          this.logger.warn(
            `SPV sync failed for connection ${id}: ${(err as Error).message}`,
          );
        }
      }
      await this.moveContentToStorage();
    } catch (err) {
      this.logger.error(`SPV sync job failed: ${(err as Error).message}`);
    } finally {
      this.running = false;
    }
  }

  private async moveContentToStorage(): Promise<void> {
    try {
      for (let batch = 0; batch < MAX_MOVE_BATCHES; batch++) {
        if ((await this.archive.moveStoredContent()) === 0) break;
      }
    } catch (err) {
      this.logger.warn(
        `Moving SPV documents to storage failed: ${(err as Error).message}`,
      );
    }
  }
}
