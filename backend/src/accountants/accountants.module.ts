import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OpenDataModule } from '../open-data/open-data.module.js';
import { CompaniesModule } from '../companies/companies.module.js';
import { Accountant } from './accountant.entity.js';
import { AccountantsController } from './accountants.controller.js';
import { AccountantsService } from './accountants.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([Accountant]),
    OpenDataModule,
    CompaniesModule,
  ],
  controllers: [AccountantsController],
  providers: [AccountantsService],
  exports: [AccountantsService],
})
export class AccountantsModule {}
