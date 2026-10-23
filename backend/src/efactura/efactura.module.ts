import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { AnafModule } from '../anaf/anaf.module.js';
import { ApiLogsModule } from '../api-logs/api-logs.module.js';
import { CompaniesModule } from '../companies/companies.module.js';
import { InvoicesModule } from '../invoices/invoices.module.js';
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
