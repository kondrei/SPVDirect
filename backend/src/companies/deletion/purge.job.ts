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
import { Company } from '../company.entity.js';
import { CompanyDeletionService } from './company-deletion.service.js';

export const PURGE_SCHEDULE = '0 3 1 * *';
export const PURGE_GRACE_DAYS = 30;
export const PURGE_BATCH = 50;
export const PURGE_LOCK_KEY = 7_400_001;
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
  ) {}

  @Cron(PURGE_SCHEDULE, { timeZone: 'Europe/Bucharest' })
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
      if (companies || accountants) {
        this.logger.log(
          `Purged ${companies} deleted companies and ${accountants} deleted accounts`,
        );
      }
    } catch (err) {
      this.logger.error(
        `Purging deleted data failed: ${(err as Error).message}`,
      );
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
  ): Promise<number> {
    let purged = 0;
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
          purged++;
        } catch (err) {
          this.logger.error(
            `Purging deleted ${label} ${id} failed: ${(err as Error).message}`,
          );
        }
      }
      if (due.length < PURGE_BATCH) return purged;
    }
  }
}
