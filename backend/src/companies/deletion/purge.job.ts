import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import {
  LessThan,
  MoreThan,
  Repository,
  type DataSource,
  type FindOptionsOrder,
  type FindOptionsSelect,
  type FindOptionsWhere,
} from 'typeorm';
import { Accountant } from '../../accountants/accountant.entity.js';
import { ActivityLogsService } from '../../api-logs/activity-logs.service.js';
import { jobFailed, purgeCompleted } from '../../api-logs/activity-entries.js';
import { ScheduledJob } from '../../api-logs/dto/api-log.enums.js';
import {
  CRON_OPTIONS,
  PURGE_LOCK_KEY,
  PURGE_SCHEDULE,
} from '../../common/constants.js';
import { Company } from '../company.entity.js';
import type { PurgeTally } from '../dto/company.types.js';
import { CompanyDeletionService } from './company-deletion.service.js';

export const PURGE_GRACE_DAYS = 30;
export const PURGE_BATCH = 50;
const DAY_MS = 24 * 3600 * 1000;

@Injectable()
export class PurgeJob {
  private readonly logger = new Logger(PurgeJob.name);
  private running = false;

  constructor(
    @InjectRepository(Company)
    private readonly companies: Repository<Company>,
    @InjectRepository(Accountant)
    private readonly accountants: Repository<Accountant>,
    private readonly deletion: CompanyDeletionService,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly activity: ActivityLogsService,
  ) {}

  @Cron(PURGE_SCHEDULE, CRON_OPTIONS)
  async run(): Promise<void> {
    if (this.running) return;
    this.running = true;
    const runner = this.dataSource.createQueryRunner();
    let locked = false;
    try {
      const [row] = (await runner.query(
        'SELECT pg_try_advisory_lock($1) AS locked',
        [PURGE_LOCK_KEY],
      )) as { locked: boolean }[];
      locked = row?.locked === true;
      if (!locked) return;
      const cutoff = new Date(Date.now() - PURGE_GRACE_DAYS * DAY_MS);
      const companies = await this.purgeAll(
        this.companies,
        cutoff,
        'company',
        (id) => this.deletion.purge(id),
      );
      const accountants = await this.purgeAll(
        this.accountants,
        cutoff,
        'account',
        (id) => this.deletion.purgeAccountant(id),
      );
      if (companies.purged || accountants.purged) {
        this.logger.log(
          `Purged ${companies.purged} deleted companies and ${accountants.purged} deleted accounts`,
        );
      }
      await this.activity.recordJob(
        purgeCompleted({
          companies: companies.purged,
          accountants: accountants.purged,
          failed: companies.failed + accountants.failed,
        }),
      );
    } catch (err) {
      this.logger.error(
        `Purging deleted data failed: ${(err as Error).message}`,
      );
      await this.activity.recordJob(jobFailed(ScheduledJob.Purge, err));
    } finally {
      if (locked) {
        await runner
          .query('SELECT pg_advisory_unlock($1)', [PURGE_LOCK_KEY])
          .catch(() => undefined);
      }
      await runner.release();
      this.running = false;
    }
  }

  private async purgeAll<T extends Company | Accountant>(
    repo: Repository<T>,
    cutoff: Date,
    label: string,
    purge: (id: number) => Promise<void>,
  ): Promise<PurgeTally> {
    const result: PurgeTally = { purged: 0, failed: 0 };
    let lastId = 0;
    for (;;) {
      const due = await repo.find({
        select: { id: true } as FindOptionsSelect<T>,
        where: {
          id: MoreThan(lastId),
          deletedAt: LessThan(cutoff),
        } as FindOptionsWhere<T>,
        withDeleted: true,
        order: { id: 'ASC' } as FindOptionsOrder<T>,
        take: PURGE_BATCH,
      });
      for (const { id } of due) {
        lastId = id;
        try {
          await purge(id);
          result.purged++;
        } catch (err) {
          result.failed++;
          this.logger.error(
            `Purging deleted ${label} ${id} failed: ${(err as Error).message}`,
          );
        }
      }
      if (due.length < PURGE_BATCH) return result;
    }
  }
}
