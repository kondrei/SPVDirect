import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AnafConnection } from '../../anaf/anaf-connection.entity.js';
import { AnafModule } from '../../anaf/anaf.module.js';
import { SpvMessage } from '../../anaf/spv/spv-message.entity.js';
import { AuthModule } from '../../auth/auth.module.js';
import { CompaniesModule } from '../../companies/companies.module.js';
import { CompanyDeletionModule } from '../../companies/deletion/company-deletion.module.js';
import { AccountantsModule } from '../accountants.module.js';
import { AccountDeletionController } from './account-deletion.controller.js';
import { AccountDeletionService } from './account-deletion.service.js';
import { AccountExportService } from './account-export.service.js';

@Module({
  imports: [
    AccountantsModule,
    AnafModule,
    AuthModule,
    CompaniesModule,
    CompanyDeletionModule,
    TypeOrmModule.forFeature([AnafConnection, SpvMessage]),
  ],
  controllers: [AccountDeletionController],
  providers: [AccountDeletionService, AccountExportService],
})
export class AccountDeletionModule {}
