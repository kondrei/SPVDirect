import { Module } from '@nestjs/common';
import { ApiLogsModule } from '../api-logs/api-logs.module.js';
import { OpenDataModule } from '../open-data/open-data.module.js';
import { CompaniesModule } from '../companies/companies.module.js';
import { AccountantsController } from './controllers/accountants.controller.js';
import { AccountantsService } from './services/accountants.service.js';

@Module({
  imports: [ApiLogsModule, OpenDataModule, CompaniesModule],
  controllers: [AccountantsController],
  providers: [AccountantsService],
  exports: [AccountantsService],
})
export class AccountantsModule {}
