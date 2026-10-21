import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ApiLogsModule } from '../api-logs/api-logs.module.js';
import { CompaniesModule } from '../companies/companies.module.js';
import { InvoiceFileStore } from './services/invoice-file-store.service.js';
import { InvoiceMailer } from './services/invoice-mailer.service.js';
import { Invoice } from './invoice.entity.js';
import { InvoicesController } from './controllers/invoices.controller.js';
import { InvoiceBuyersService } from './services/invoice-buyers.service.js';
import { InvoiceDeliveryService } from './services/invoice-delivery.service.js';
import { InvoiceNumbering } from './services/invoice-numbering.service.js';
import { InvoiceStornoService } from './services/invoice-storno.service.js';
import { InvoicesService } from './services/invoices.service.js';

@Module({
  imports: [
    HttpModule,
    ApiLogsModule,
    CompaniesModule,
    TypeOrmModule.forFeature([Invoice]),
  ],
  controllers: [InvoicesController],
  providers: [
    InvoicesService,
    InvoiceBuyersService,
    InvoiceStornoService,
    InvoiceDeliveryService,
    InvoiceNumbering,
    InvoiceFileStore,
    InvoiceMailer,
  ],
  exports: [InvoicesService, InvoiceDeliveryService, InvoiceFileStore],
})
export class InvoicesModule {}
