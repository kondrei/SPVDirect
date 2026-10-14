import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AnafModule } from '../anaf/anaf.module.js';
import { ApiLogsModule } from '../api-logs/api-logs.module.js';
import { CompaniesModule } from '../companies/companies.module.js';
import { InvoicesModule } from '../invoices/invoices.module.js';
import { EfacturaUpload } from './efactura-upload.entity.js';
import { EfacturaController } from './controllers/efactura.controller.js';
import { EfacturaService } from './services/efactura.service.js';
import { EfacturaValidator } from './services/efactura-validator.service.js';

@Module({
  imports: [
    HttpModule,
    ApiLogsModule,
    AnafModule,
    CompaniesModule,
    InvoicesModule,
    TypeOrmModule.forFeature([EfacturaUpload]),
  ],
  controllers: [EfacturaController],
  providers: [EfacturaService, EfacturaValidator],
  exports: [EfacturaService],
})
export class EfacturaModule {}
