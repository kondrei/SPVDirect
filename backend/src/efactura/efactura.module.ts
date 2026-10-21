import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AnafModule } from '../anaf/anaf.module.js';
import { ApiLogsModule } from '../api-logs/api-logs.module.js';
import { CompaniesModule } from '../companies/companies.module.js';
import { Company } from '../companies/company.entity.js';
import { InvoicesModule } from '../invoices/invoices.module.js';
import { EfacturaInvoice } from './efactura-invoice.entity.js';
import { EfacturaUpload } from './efactura-upload.entity.js';
import { EfacturaArchiveController } from './controllers/efactura-archive.controller.js';
import { EfacturaController } from './controllers/efactura.controller.js';
import { EfacturaArchiveSyncJob } from './jobs/efactura-archive-sync.job.js';
import { EfacturaArchiveMailer } from './services/efactura-archive-mailer.service.js';
import { EfacturaArchiveService } from './services/efactura-archive.service.js';
import { EfacturaFileStore } from './services/efactura-file-store.service.js';
import { EfacturaService } from './services/efactura.service.js';
import { EfacturaValidator } from './services/efactura-validator.service.js';

@Module({
  imports: [
    HttpModule,
    ApiLogsModule,
    AnafModule,
    CompaniesModule,
    InvoicesModule,
    TypeOrmModule.forFeature([EfacturaUpload, EfacturaInvoice, Company]),
  ],
  controllers: [EfacturaController, EfacturaArchiveController],
  providers: [
    EfacturaService,
    EfacturaValidator,
    EfacturaArchiveService,
    EfacturaArchiveMailer,
    EfacturaFileStore,
    EfacturaArchiveSyncJob,
  ],
  exports: [EfacturaService, EfacturaArchiveService, EfacturaFileStore],
})
export class EfacturaModule {}
