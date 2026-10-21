import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ApiLogsModule } from '../../api-logs/api-logs.module.js';
import { Accountant } from '../../accountants/accountant.entity.js';
import { AnafModule } from '../../anaf/anaf.module.js';
import { SpvMessage } from '../../anaf/spv/spv-message.entity.js';
import { EfacturaUpload } from '../../efactura/efactura-upload.entity.js';
import { Invoice } from '../../invoices/invoice.entity.js';
import { InvoicesModule } from '../../invoices/invoices.module.js';
import { CompaniesModule } from '../companies.module.js';
import { Company } from '../company.entity.js';
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
    TypeOrmModule.forFeature([
      Accountant,
      Company,
      Invoice,
      EfacturaUpload,
      SpvMessage,
    ]),
  ],
  controllers: [CompanyDeletionController],
  providers: [CompanyDeletionService, CompanyExportService, PurgeJob],
  exports: [CompanyDeletionService, CompanyExportService],
})
export class CompanyDeletionModule {}
