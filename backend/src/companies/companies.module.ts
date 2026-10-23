import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { AnafGatewayModule } from '../anaf/anaf-gateway.module.js';
import { ApiLogsModule } from '../api-logs/api-logs.module.js';
import { OpenDataModule } from '../open-data/open-data.module.js';
import { AnafCompanyLookupService } from './services/anaf-company-lookup.service.js';
import { CompaniesController } from './controllers/companies.controller.js';
import { CompaniesService } from './services/companies.service.js';

@Module({
  imports: [HttpModule, ApiLogsModule, AnafGatewayModule, OpenDataModule],
  controllers: [CompaniesController],
  providers: [CompaniesService, AnafCompanyLookupService],
  exports: [CompaniesService, AnafCompanyLookupService],
})
export class CompaniesModule {}
