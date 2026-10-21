import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThan, Repository } from 'typeorm';
import { ActivityLogsService } from '../../api-logs/activity-logs.service.js';
import {
  jobFailed,
  spvSyncCompleted,
} from '../../api-logs/activity-entries.js';
import { ScheduledJob } from '../../api-logs/dto/api-log.enums.js';
import type { SpvSyncCounts } from '../../api-logs/dto/api-log.types.js';
import { CRON_OPTIONS, SPV_SYNC_SCHEDULE } from '../../common/constants.js';
import { AnafConnection } from '../anaf-connection.entity.js';
import {
  DEFAULT_SYNC_DAYS,
  SpvArchiveService,
} from './services/spv-archive.service.js';
import { AnafConnectionStatus } from '../dto/anaf.enums.js';

export const MAX_MOVE_BATCHES = 10;

@Injectable()
export class SpvSyncJob {
  private readonly logger = new Logger(SpvSyncJob.name);
  private running = false;

  constructor(
    private readonly archive: SpvArchiveService,
    @InjectRepository(AnafConnection)
    private readonly connections: Repository<AnafConnection>,
    private readonly activity: ActivityLogsService,
  ) {}

  @Cron(SPV_SYNC_SCHEDULE, CRON_OPTIONS)
  async run(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const active = await this.connections.find({
        select: { id: true, accountantId: true },
        where: {
          status: AnafConnectionStatus.Active,
          refreshExpiresAt: MoreThan(new Date()),
        },
        order: { id: 'ASC' },
      });
      const counts: SpvSyncCounts = { connections: 0, moved: 0, failed: 0 };
      for (const { id, accountantId } of active) {
        try {
          await this.archive.sync(accountantId, id, DEFAULT_SYNC_DAYS);
          counts.connections++;
        } catch (err) {
          counts.failed++;
          this.logger.warn(
            `SPV sync failed for connection ${id}: ${(err as Error).message}`,
          );
        }
      }
      await this.moveContentToStorage(counts);
      await this.activity.recordJob(spvSyncCompleted(counts));
    } catch (err) {
      this.logger.error(`SPV sync job failed: ${(err as Error).message}`);
      await this.activity.recordJob(jobFailed(ScheduledJob.SpvSync, err));
    } finally {
      this.running = false;
    }
  }

  private async moveContentToStorage(counts: SpvSyncCounts): Promise<void> {
    try {
      for (let batch = 0; batch < MAX_MOVE_BATCHES; batch++) {
        const moved = await this.archive.moveStoredContent();
        if (moved === 0) break;
        counts.moved += moved;
      }
    } catch (err) {
      counts.failed++;
      this.logger.warn(
        `Moving SPV documents to storage failed: ${(err as Error).message}`,
      );
    }
  }
}
