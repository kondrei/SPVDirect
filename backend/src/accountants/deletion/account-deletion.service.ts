import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import type { DataSource } from 'typeorm';
import { AuthorizationLinkRepository } from '../../anaf/authorization-links/repositories/authorization-link.repository.js';
import { AnafConnectionsService } from '../../anaf/services/anaf-connections.service.js';
import { SpvMessageRepository } from '../../anaf/spv/repositories/spv-message.repository.js';
import { verifyPassword } from '../../common/crypto/password.js';
import { CompanyRepository } from '../../companies/repositories/company.repository.js';
import { EfacturaInvoiceRepository } from '../../efactura/repositories/efactura-invoice.repository.js';
import { EfacturaUploadRepository } from '../../efactura/repositories/efactura-upload.repository.js';
import { InvoiceRepository } from '../../invoices/repositories/invoice.repository.js';
import { AccountantRepository } from '../repositories/accountant.repository.js';

export const WRONG_PASSWORD = 'Parola este incorectă';
export const ACCOUNT_UPLOAD_IN_PROGRESS =
  'O factură este în curs de trimitere la ANAF. Reîncercați după ce trimiterea se încheie.';

@Injectable()
export class AccountDeletionService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly anafConnectionsService: AnafConnectionsService,
    private readonly accountantRepository: AccountantRepository,
    private readonly companyRepository: CompanyRepository,
    private readonly invoiceRepository: InvoiceRepository,
    private readonly efacturaUploadRepository: EfacturaUploadRepository,
    private readonly efacturaInvoiceRepository: EfacturaInvoiceRepository,
    private readonly spvMessageRepository: SpvMessageRepository,
    private readonly authorizationLinkRepository: AuthorizationLinkRepository,
  ) {}

  async softDelete(accountantId: number, password: string): Promise<void> {
    const accountant =
      await this.accountantRepository.findWithPassword(accountantId);
    if (!accountant) throw new NotFoundException('Contul nu a fost găsit');
    if (!(await verifyPassword(password, accountant.passwordHash))) {
      throw new BadRequestException(WRONG_PASSWORD);
    }

    await this.dataSource.transaction(async (manager) => {
      await this.companyRepository.lockLive(manager, accountantId);
      if (
        await this.efacturaUploadRepository.sendingForAccountant(
          manager,
          accountantId,
        )
      ) {
        throw new ConflictException(ACCOUNT_UPLOAD_IN_PROGRESS);
      }
      await this.invoiceRepository.softDeleteOfAccountant(
        manager,
        accountantId,
      );
      await this.efacturaUploadRepository.softDeleteOfAccountant(
        manager,
        accountantId,
      );
      await this.efacturaInvoiceRepository.softDeleteOfAccountant(
        manager,
        accountantId,
      );
      await this.spvMessageRepository.softDeleteOfAccountant(
        manager,
        accountantId,
      );
      await this.companyRepository.softDeleteOfAccountant(
        manager,
        accountantId,
      );
      await this.authorizationLinkRepository.deleteOfAccountant(
        manager,
        accountantId,
      );
      await this.accountantRepository.markDeleted(manager, accountantId);
    });

    await this.anafConnectionsService.removeAll(accountantId);
  }
}
