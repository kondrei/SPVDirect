import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { AccountantRepository } from '../../accountants/repositories/accountant.repository.js';
import { ActivityLogsService } from '../../api-logs/activity-logs.service.js';
import {
  companiesPurged,
  jobFailed,
  purgeCompleted,
} from '../../api-logs/activity-entries.js';
import { ScheduledJob } from '../../api-logs/dto/api-log.enums.js';
import {
  CRON_OPTIONS,
  PURGE_LOCK_KEY,
  PURGE_SCHEDULE,
} from '../../common/constants.js';
import { AdvisoryLockRepository } from '../../database/repositories/advisory-lock.repository.js';
import type { PurgeTally } from '../dto/company.types.js';
import { CompanyRepository } from '../repositories/company.repository.js';
import { CompanyDeletionService } from './company-deletion.service.js';

export const PURGE_GRACE_DAYS = 30;
export const PURGE_BATCH = 50;
const DAY_MS = 24 * 3600 * 1000;

@Injectable()
export class PurgeJob {
  private readonly logger = new Logger(PurgeJob.name);
  private running = false;

  constructor(
    private readonly companyRepository: CompanyRepository,
    private readonly accountantRepository: AccountantRepository,
    private readonly companyDeletionService: CompanyDeletionService,
    private readonly advisoryLockRepository: AdvisoryLockRepository,
    private readonly activityLogsService: ActivityLogsService,
  ) {}

  @Cron(PURGE_SCHEDULE, CRON_OPTIONS)
  async run(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.advisoryLockRepository.runExclusive(PURGE_LOCK_KEY, () =>
        this.purge(),
      );
    } catch (err) {
      this.logger.error(
        `Purging deleted data failed: ${(err as Error).message}`,
      );
      await this.activityLogsService.recordJob(
        jobFailed(ScheduledJob.Purge, err),
      );
    } finally {
      this.running = false;
    }
  }

  private async purge(): Promise<void> {
    const cutoff = new Date(Date.now() - PURGE_GRACE_DAYS * DAY_MS);
    const purgedPerAccountant = new Map<number, number>();
    const companies = await this.purgeAll(
      (afterId) =>
        this.companyRepository.deletedBefore(cutoff, afterId, PURGE_BATCH),
      'company',
      async ({ id, accountantId }) => {
        await this.companyDeletionService.purge(id);
        purgedPerAccountant.set(
          accountantId,
          (purgedPerAccountant.get(accountantId) ?? 0) + 1,
        );
      },
    );
    for (const [accountantId, count] of purgedPerAccountant) {
      await this.activityLogsService.record(
        accountantId,
        companiesPurged(count, PURGE_GRACE_DAYS),
      );
    }
    const accountants = await this.purgeAll(
      (afterId) =>
        this.accountantRepository.deletedBefore(cutoff, afterId, PURGE_BATCH),
      'account',
      ({ id }) => this.companyDeletionService.purgeAccountant(id),
    );
    if (companies.purged || accountants.purged) {
      this.logger.log(
        `Purged ${companies.purged} deleted companies and ${accountants.purged} deleted accounts`,
      );
    }
    await this.activityLogsService.recordJob(
      purgeCompleted({
        companies: companies.purged,
        accountants: accountants.purged,
        failed: companies.failed + accountants.failed,
      }),
    );
  }

  private async purgeAll<T extends { id: number }>(
    due: (afterId: number) => Promise<T[]>,
    label: string,
    purge: (row: T) => Promise<void>,
  ): Promise<PurgeTally> {
    const result: PurgeTally = { purged: 0, failed: 0 };
    let lastId = 0;
    for (;;) {
      const rows = await due(lastId);
      for (const row of rows) {
        const { id } = row;
        lastId = id;
        try {
          await purge(row);
          result.purged++;
        } catch (err) {
          result.failed++;
          this.logger.error(
            `Purging deleted ${label} ${id} failed: ${(err as Error).message}`,
          );
        }
      }
      if (rows.length < PURGE_BATCH) return result;
    }
  }
}
