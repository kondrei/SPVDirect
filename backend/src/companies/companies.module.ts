import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AnafConnection } from '../anaf/anaf-connection.entity.js';
import { ApiLogsModule } from '../api-logs/api-logs.module.js';
import { OpenDataModule } from '../open-data/open-data.module.js';
import { AnafCompanyLookupService } from './anaf-company-lookup.service.js';
import { CompaniesController } from './companies.controller.js';
import { CompaniesService } from './companies.service.js';
import { Company } from './company.entity.js';

@Module({
  imports: [
    HttpModule,
    ApiLogsModule,
    OpenDataModule,
    TypeOrmModule.forFeature([Company, AnafConnection]),
  ],
  controllers: [CompaniesController],
  providers: [CompaniesService, AnafCompanyLookupService],
  exports: [CompaniesService, AnafCompanyLookupService],
})
export class CompaniesModule {}
