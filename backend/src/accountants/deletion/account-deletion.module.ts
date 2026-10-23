import { Module } from '@nestjs/common';
import { ApiLogsModule } from '../../api-logs/api-logs.module.js';
import { AnafModule } from '../../anaf/anaf.module.js';
import { AuthModule } from '../../auth/auth.module.js';
import { CompaniesModule } from '../../companies/companies.module.js';
import { CompanyDeletionModule } from '../../companies/deletion/company-deletion.module.js';
import { AccountantsModule } from '../accountants.module.js';
import { AccountDeletionController } from './account-deletion.controller.js';
import { AccountDeletionService } from './account-deletion.service.js';
import { AccountExportService } from './account-export.service.js';

@Module({
  imports: [
    ApiLogsModule,
    AccountantsModule,
    AnafModule,
    AuthModule,
    CompaniesModule,
    CompanyDeletionModule,
  ],
  controllers: [AccountDeletionController],
  providers: [AccountDeletionService, AccountExportService],
})
export class AccountDeletionModule {}
