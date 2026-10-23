import { ConflictException, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import type { DataSource } from 'typeorm';
import { AccountantRepository } from '../../accountants/repositories/accountant.repository.js';
import { companyDeleted } from '../../api-logs/activity-entries.js';
import { ActivityLogsService } from '../../api-logs/activity-logs.service.js';
import { ApiLogRepository } from '../../api-logs/repositories/api-log.repository.js';
import { AuthorizationLinkRepository } from '../../anaf/authorization-links/repositories/authorization-link.repository.js';
import { AnafConnectionsService } from '../../anaf/services/anaf-connections.service.js';
import { SpvMessageRepository } from '../../anaf/spv/repositories/spv-message.repository.js';
import { SpvFileStore } from '../../anaf/spv/services/spv-file-store.service.js';
import { EfacturaInvoiceRepository } from '../../efactura/repositories/efactura-invoice.repository.js';
import { EfacturaUploadRepository } from '../../efactura/repositories/efactura-upload.repository.js';
import { EfacturaFileStore } from '../../efactura/services/efactura-file-store.service.js';
import { InvoiceRepository } from '../../invoices/repositories/invoice.repository.js';
import { InvoiceFileStore } from '../../invoices/services/invoice-file-store.service.js';
import { lockLiveCompany } from '../company-lock.js';
import { CompanyRepository } from '../repositories/company.repository.js';
import { CompaniesService } from '../services/companies.service.js';

export const UPLOAD_IN_PROGRESS =
  'Firma are o factură în curs de trimitere la ANAF. Reîncercați după ce trimiterea se încheie.';

@Injectable()
export class CompanyDeletionService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly companiesService: CompaniesService,
    private readonly invoiceFileStore: InvoiceFileStore,
    private readonly spvFileStore: SpvFileStore,
    private readonly efacturaFileStore: EfacturaFileStore,
    private readonly anafConnectionsService: AnafConnectionsService,
    private readonly activityLogsService: ActivityLogsService,
    private readonly companyRepository: CompanyRepository,
    private readonly accountantRepository: AccountantRepository,
    private readonly invoiceRepository: InvoiceRepository,
    private readonly efacturaUploadRepository: EfacturaUploadRepository,
    private readonly efacturaInvoiceRepository: EfacturaInvoiceRepository,
    private readonly spvMessageRepository: SpvMessageRepository,
    private readonly authorizationLinkRepository: AuthorizationLinkRepository,
    private readonly apiLogRepository: ApiLogRepository,
  ) {}

  async softDelete(accountantId: number, id: number): Promise<void> {
    const company = await this.companiesService.get(accountantId, id);
    await this.dataSource.transaction(async (manager) => {
      await lockLiveCompany(this.companyRepository, manager, accountantId, id);
      if (await this.efacturaUploadRepository.sendingForCompany(manager, id)) {
        throw new ConflictException(UPLOAD_IN_PROGRESS);
      }
      await this.spvMessageRepository.linkUnmatched(manager, company);
      await this.invoiceRepository.softDeleteOfCompany(manager, id);
      await this.efacturaUploadRepository.softDeleteOfCompany(manager, id);
      await this.efacturaInvoiceRepository.softDeleteOfCompany(manager, id);
      await this.spvMessageRepository.softDeleteOfCompany(manager, id);
      await this.authorizationLinkRepository.deleteUnusedOfCompany(manager, id);
      await this.companyRepository.softDelete(manager, id);
    });
    await this.activityLogsService.record(
      accountantId,
      companyDeleted(company),
    );
  }

  async purge(companyId: number): Promise<void> {
    const [invoices, messages, archived] = await Promise.all([
      this.invoiceRepository.storedOfCompany(companyId),
      this.spvMessageRepository.storedOfCompany(companyId),
      this.efacturaInvoiceRepository.storedOfCompany(companyId),
    ]);
    const invoicePaths = storedPaths(invoices);
    const spvPaths = await this.unusedSpvPaths(storedPaths(messages));
    if (invoicePaths.length) await this.invoiceFileStore.remove(invoicePaths);
    if (spvPaths.length) await this.spvFileStore.remove(spvPaths);
    const archivePaths = archived.flatMap((r) =>
      [r.zipStoragePath, r.pdfStoragePath].filter((p) => p !== null),
    );
    if (archivePaths.length) await this.efacturaFileStore.remove(archivePaths);

    await this.dataSource.transaction(async (manager) => {
      await this.efacturaInvoiceRepository.purgeCompany(manager, companyId);
      await this.efacturaUploadRepository.purgeCompany(manager, companyId);
      await this.invoiceRepository.purgeCompany(manager, companyId);
      await this.spvMessageRepository.purgeCompany(manager, companyId);
      await this.apiLogRepository.purgeCompanyActivity(manager, companyId);
      await this.companyRepository.purge(manager, companyId);
    });
  }

  async purgeAccountant(accountantId: number): Promise<void> {
    const companies =
      await this.companyRepository.idsOfAccountantWithDeleted(accountantId);
    for (const { id } of companies) await this.purge(id);

    const messages =
      await this.spvMessageRepository.storedOfAccountant(accountantId);
    const spvPaths = storedPaths(messages);
    if (spvPaths.length) await this.spvFileStore.remove(spvPaths);
    await this.anafConnectionsService.removeAll(accountantId);
    await this.accountantRepository.delete(accountantId);
  }

  private async unusedSpvPaths(paths: string[]): Promise<string[]> {
    if (!paths.length) return [];
    const live = await this.spvMessageRepository.liveWithPaths(paths);
    const used = new Set(storedPaths(live));
    return paths.filter((p) => !used.has(p));
  }
}

function storedPaths(rows: { storagePath: string | null }[]): string[] {
  return rows.flatMap((r) => (r.storagePath ? [r.storagePath] : []));
}
