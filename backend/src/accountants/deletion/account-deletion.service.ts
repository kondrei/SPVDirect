import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import type { DataSource } from 'typeorm';
import { AuthorizationLink } from '../../anaf/authorization-links/authorization-link.entity.js';
import { AnafConnectionsService } from '../../anaf/services/anaf-connections.service.js';
import { SpvMessage } from '../../anaf/spv/spv-message.entity.js';
import { verifyPassword } from '../../common/crypto/password.js';
import { lockLiveCompanies } from '../../companies/company-lock.js';
import { Company } from '../../companies/company.entity.js';
import { EfacturaInvoice } from '../../efactura/efactura-invoice.entity.js';
import { EfacturaUpload } from '../../efactura/efactura-upload.entity.js';
import { Invoice } from '../../invoices/invoice.entity.js';
import { Accountant } from '../accountant.entity.js';
import { AccountStatus } from '../dto/accountant.enums.js';
import { UploadStatus } from '../../efactura/dto/efactura.enums.js';

export const WRONG_PASSWORD = 'Parola este incorectă';
export const ACCOUNT_UPLOAD_IN_PROGRESS =
  'O factură este în curs de trimitere la ANAF. Reîncercați după ce trimiterea se încheie.';

@Injectable()
export class AccountDeletionService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly connections: AnafConnectionsService,
  ) {}

  async softDelete(accountantId: number, password: string): Promise<void> {
    const accountant = await this.dataSource
      .getRepository(Accountant)
      .createQueryBuilder('a')
      .addSelect('a.passwordHash')
      .where('a.id = :id', { id: accountantId })
      .getOne();
    if (!accountant) throw new NotFoundException('Contul nu a fost găsit');
    if (!(await verifyPassword(password, accountant.passwordHash))) {
      throw new BadRequestException(WRONG_PASSWORD);
    }

    await this.dataSource.transaction(async (manager) => {
      await lockLiveCompanies(manager, accountantId);
      if (
        await manager.existsBy(EfacturaUpload, {
          accountantId,
          status: UploadStatus.Sending,
        })
      ) {
        throw new ConflictException(ACCOUNT_UPLOAD_IN_PROGRESS);
      }
      await manager.softDelete(Invoice, { accountantId });
      await manager.softDelete(EfacturaUpload, { accountantId });
      await manager.softDelete(EfacturaInvoice, { accountantId });
      await manager.softDelete(SpvMessage, { accountantId });
      await manager.softDelete(Company, { accountantId });
      await manager.delete(AuthorizationLink, { accountantId });
      await manager.update(
        Accountant,
        { id: accountantId },
        { status: AccountStatus.Deleted },
      );
      await manager.softDelete(Accountant, { id: accountantId });
    });

    await this.connections.removeAll(accountantId);
  }
}
