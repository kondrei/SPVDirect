import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
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
import type { Company } from '../../companies/company.entity.js';
import { CompanyRepository } from '../../companies/repositories/company.repository.js';
import { AdvisoryLockRepository } from '../../database/repositories/advisory-lock.repository.js';
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
    private readonly configService: ConfigService,
    private readonly efacturaArchiveService: EfacturaArchiveService,
    private readonly companyRepository: CompanyRepository,
    private readonly advisoryLockRepository: AdvisoryLockRepository,
    private readonly activityLogsService: ActivityLogsService,
  ) {}

  @Cron(EFACTURA_ARCHIVE_SYNC_SCHEDULE, CRON_OPTIONS)
  async run(): Promise<void> {
    if (!this.configService.get<boolean>('EFACTURA_ARCHIVE_SYNC')) return;
    if (this.running) return;
    this.running = true;
    try {
      await this.advisoryLockRepository.runExclusive(
        EFACTURA_ARCHIVE_SYNC_LOCK_KEY,
        async () => {
          const counts = await this.syncAll();
          if (counts.imported) {
            this.logger.log(`Imported ${counts.imported} e-Factura invoices`);
          }
          await this.activityLogsService.recordJob(
            efacturaArchiveSyncCompleted(counts),
          );
        },
      );
    } catch (err) {
      this.logger.error(
        `e-Factura archive sync failed: ${(err as Error).message}`,
      );
      await this.activityLogsService.recordJob(
        jobFailed(ScheduledJob.EfacturaArchiveSync, err),
      );
    } finally {
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
      const companies = await this.companyRepository.certifiedAfter(
        lastId,
        ARCHIVE_SYNC_BATCH,
      );
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
        const result = await this.efacturaArchiveService.importPeriod(
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
      await this.activityLogsService.record(
        company.accountantId,
        efacturaArchiveSyncFailed(company, err),
      );
      return { imported, failed: true };
    }
  }
}
