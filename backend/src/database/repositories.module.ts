import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Accountant } from '../accountants/accountant.entity.js';
import { AccountantRepository } from '../accountants/repositories/accountant.repository.js';
import { AnafConnection } from '../anaf/anaf-connection.entity.js';
import { AuthorizationLink } from '../anaf/authorization-links/authorization-link.entity.js';
import { AuthorizationLinkRepository } from '../anaf/authorization-links/repositories/authorization-link.repository.js';
import { AnafConnectionRepository } from '../anaf/repositories/anaf-connection.repository.js';
import { SpvMessageRepository } from '../anaf/spv/repositories/spv-message.repository.js';
import { SpvMessage } from '../anaf/spv/spv-message.entity.js';
import { ApiLog } from '../api-logs/api-log.entity.js';
import { ApiLogRepository } from '../api-logs/repositories/api-log.repository.js';
import { AccountantMfa } from '../auth/accountant-mfa.entity.js';
import { BannedEmail } from '../auth/banned-email.entity.js';
import { AccountantMfaRepository } from '../auth/repositories/accountant-mfa.repository.js';
import { BannedEmailRepository } from '../auth/repositories/banned-email.repository.js';
import { Company } from '../companies/company.entity.js';
import { CompanyRepository } from '../companies/repositories/company.repository.js';
import { EfacturaInvoice } from '../efactura/efactura-invoice.entity.js';
import { EfacturaUpload } from '../efactura/efactura-upload.entity.js';
import { EfacturaInvoiceRepository } from '../efactura/repositories/efactura-invoice.repository.js';
import { EfacturaUploadRepository } from '../efactura/repositories/efactura-upload.repository.js';
import { Invoice } from '../invoices/invoice.entity.js';
import { InvoiceRepository } from '../invoices/repositories/invoice.repository.js';
import { AdvisoryLockRepository } from './repositories/advisory-lock.repository.js';

const REPOSITORIES = [
  AccountantRepository,
  AccountantMfaRepository,
  AnafConnectionRepository,
  AuthorizationLinkRepository,
  SpvMessageRepository,
  ApiLogRepository,
  BannedEmailRepository,
  CompanyRepository,
  EfacturaInvoiceRepository,
  EfacturaUploadRepository,
  InvoiceRepository,
  AdvisoryLockRepository,
];

@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([
      Accountant,
      AccountantMfa,
      AnafConnection,
      AuthorizationLink,
      SpvMessage,
      ApiLog,
      BannedEmail,
      Company,
      EfacturaInvoice,
      EfacturaUpload,
      Invoice,
    ]),
  ],
  providers: REPOSITORIES,
  exports: REPOSITORIES,
})
export class RepositoriesModule {}
