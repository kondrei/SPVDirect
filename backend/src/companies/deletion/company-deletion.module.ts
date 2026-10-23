import { Module } from '@nestjs/common';
import { ApiLogsModule } from '../../api-logs/api-logs.module.js';
import { AnafModule } from '../../anaf/anaf.module.js';
import { EfacturaModule } from '../../efactura/efactura.module.js';
import { InvoicesModule } from '../../invoices/invoices.module.js';
import { CompaniesModule } from '../companies.module.js';
import { CompanyDeletionController } from './company-deletion.controller.js';
import { CompanyDeletionService } from './company-deletion.service.js';
import { CompanyExportService } from './company-export.service.js';
import { PurgeJob } from './purge.job.js';

@Module({
  imports: [
    ApiLogsModule,
    CompaniesModule,
    InvoicesModule,
    AnafModule,
    EfacturaModule,
  ],
  controllers: [CompanyDeletionController],
  providers: [CompanyDeletionService, CompanyExportService, PurgeJob],
  exports: [CompanyDeletionService, CompanyExportService],
})
export class CompanyDeletionModule {}
