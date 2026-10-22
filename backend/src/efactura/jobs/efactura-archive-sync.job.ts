import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { MoreThan, Not, IsNull, Repository, type DataSource } from 'typeorm';
import { ActivityLogsService } from '../../api-logs/activity-logs.service.js';
import {
  efacturaArchiveSyncCompleted,
  efacturaArchiveSyncFailed,
  jobFailed,
} from '../../api-logs/activity-entries.js';
import { ScheduledJob } from '../../api-logs/dto/api-log.enums.js';
import type { EfacturaArchiveSyncCounts } from '../../api-logs/dto/api-log.types.js';
import {
  CRON_OPTIONS,
  EFACTURA_ARCHIVE_SYNC_LOCK_KEY,
  EFACTURA_ARCHIVE_SYNC_SCHEDULE,
} from '../../common/constants.js';
import { Company } from '../../companies/company.entity.js';
import {
  ARCHIVE_SYNC_BATCH,
  MAX_MESSAGE_DAYS,
} from '../dto/efactura.constants.js';
import { ImportStatus } from '../dto/efactura.enums.js';
import type { CompanySyncResult } from '../dto/efactura.types.js';
import { EfacturaArchiveService } from '../services/efactura-archive.service.js';

@Injectable()
export class EfacturaArchiveSyncJob {
  private readonly logger = new Logger(EfacturaArchiveSyncJob.name);
  private running = false;

  constructor(
    private readonly config: ConfigService,
    private readonly archive: EfacturaArchiveService,
    @InjectRepository(Company)
    private readonly companies: Repository<Company>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly activity: ActivityLogsService,
  ) {}

  @Cron(EFACTURA_ARCHIVE_SYNC_SCHEDULE, CRON_OPTIONS)
  async run(): Promise<void> {
    if (!this.config.get<boolean>('EFACTURA_ARCHIVE_SYNC')) return;
    if (this.running) return;
    this.running = true;
    const runner = this.dataSource.createQueryRunner();
    let locked = false;
    try {
      const [row] = (await runner.query(
        'SELECT pg_try_advisory_lock($1) AS locked',
        [EFACTURA_ARCHIVE_SYNC_LOCK_KEY],
      )) as { locked: boolean }[];
      locked = row?.locked === true;
      if (!locked) return;
      const counts = await this.syncAll();
      if (counts.imported) {
        this.logger.log(`Imported ${counts.imported} e-Factura invoices`);
      }
      await this.activity.recordJob(efacturaArchiveSyncCompleted(counts));
    } catch (err) {
      this.logger.error(
        `e-Factura archive sync failed: ${(err as Error).message}`,
      );
      await this.activity.recordJob(
        jobFailed(ScheduledJob.EfacturaArchiveSync, err),
      );
    } finally {
      if (locked) {
        await runner
          .query('SELECT pg_advisory_unlock($1)', [
            EFACTURA_ARCHIVE_SYNC_LOCK_KEY,
          ])
          .catch(() => undefined);
      }
      await runner.release();
      this.running = false;
    }
  }

  private async syncAll(): Promise<EfacturaArchiveSyncCounts> {
    const counts: EfacturaArchiveSyncCounts = {
      companies: 0,
      imported: 0,
      failed: 0,
    };
    let lastId = 0;
    for (;;) {
      const companies = await this.companies.find({
        select: { id: true, accountantId: true, name: true, cui: true },
        where: { id: MoreThan(lastId), anafConnectionId: Not(IsNull()) },
        order: { id: 'ASC' },
        take: ARCHIVE_SYNC_BATCH,
      });
      for (const company of companies) {
        lastId = company.id;
        counts.companies++;
        const { imported, failed } = await this.syncCompany(company);
        counts.imported += imported;
        if (failed) counts.failed++;
      }
      if (companies.length < ARCHIVE_SYNC_BATCH) return counts;
    }
  }

  private async syncCompany(
    company: Pick<Company, 'id' | 'accountantId' | 'name' | 'cui'>,
  ): Promise<CompanySyncResult> {
    let imported = 0;
    try {
      for (;;) {
        const result = await this.archive.importPeriod(
          company.accountantId,
          company.id,
          MAX_MESSAGE_DAYS,
          true,
        );
        const added = result.results.filter(
          (r) => r.status === ImportStatus.Imported,
        ).length;
        imported += added;
        if (!result.remaining || !added) return { imported, failed: false };
      }
    } catch (err) {
      this.logger.warn(
        `e-Factura archive sync of company ${company.id} failed: ${(err as Error).message}`,
      );
      await this.activity.record(
        company.accountantId,
        efacturaArchiveSyncFailed(company, err),
      );
      return { imported, failed: true };
    }
  }
}
