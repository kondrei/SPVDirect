import { ConflictException, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { In, IsNull, Not, type DataSource } from 'typeorm';
import { Accountant } from '../../accountants/accountant.entity.js';
import { AuthorizationLink } from '../../anaf/authorization-links/authorization-link.entity.js';
import { AnafConnectionsService } from '../../anaf/services/anaf-connections.service.js';
import { SpvFileStore } from '../../anaf/spv/services/spv-file-store.service.js';
import { SpvMessage } from '../../anaf/spv/spv-message.entity.js';
import { EfacturaUpload } from '../../efactura/efactura-upload.entity.js';
import { Invoice } from '../../invoices/invoice.entity.js';
import { InvoiceFileStore } from '../../invoices/services/invoice-file-store.service.js';
import { lockLiveCompany } from '../company-lock.js';
import { Company } from '../company.entity.js';
import { CompaniesService } from '../services/companies.service.js';
import { companySpvMessages } from './company-records.js';
import { UploadStatus } from '../../efactura/dto/efactura.enums.js';

export const UPLOAD_IN_PROGRESS =
  'Firma are o factură în curs de trimitere la ANAF. Reîncercați după ce trimiterea se încheie.';

@Injectable()
export class CompanyDeletionService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly companies: CompaniesService,
    private readonly invoiceFiles: InvoiceFileStore,
    private readonly spvFiles: SpvFileStore,
    private readonly connections: AnafConnectionsService,
  ) {}

  async softDelete(accountantId: number, id: number): Promise<void> {
    const company = await this.companies.get(accountantId, id);
    await this.dataSource.transaction(async (manager) => {
      await lockLiveCompany(manager, accountantId, id);
      if (
        await manager.existsBy(EfacturaUpload, {
          companyId: id,
          status: UploadStatus.Sending,
        })
      ) {
        throw new ConflictException(UPLOAD_IN_PROGRESS);
      }
      const unlinked = await companySpvMessages(
        manager.getRepository(SpvMessage),
        company,
      )
        .andWhere('m.companyId IS NULL')
        .select('m.id', 'id')
        .getRawMany<{ id: number }>();
      if (unlinked.length) {
        await manager.update(
          SpvMessage,
          { id: In(unlinked.map((m) => m.id)) },
          { companyId: id },
        );
      }
      await manager.softDelete(Invoice, { companyId: id });
      await manager.softDelete(EfacturaUpload, { companyId: id });
      await manager.softDelete(SpvMessage, { companyId: id });
      await manager.delete(AuthorizationLink, {
        companyId: id,
        usedAt: IsNull(),
      });
      await manager.softDelete(Company, { id });
    });
  }

  async purge(companyId: number): Promise<void> {
    const [invoices, messages] = await Promise.all([
      this.dataSource.getRepository(Invoice).find({
        select: { id: true, storagePath: true },
        where: { companyId, storagePath: Not(IsNull()) },
        withDeleted: true,
      }),
      this.dataSource.getRepository(SpvMessage).find({
        select: { id: true, storagePath: true },
        where: { companyId, storagePath: Not(IsNull()) },
        withDeleted: true,
      }),
    ]);
    const invoicePaths = storedPaths(invoices);
    const spvPaths = await this.unusedSpvPaths(storedPaths(messages));
    if (invoicePaths.length) await this.invoiceFiles.remove(invoicePaths);
    if (spvPaths.length) await this.spvFiles.remove(spvPaths);

    await this.dataSource.transaction(async (manager) => {
      await manager.delete(EfacturaUpload, { companyId });
      await manager.delete(Invoice, {
        companyId,
        stornoOfInvoiceId: Not(IsNull()),
      });
      await manager.delete(Invoice, { companyId });
      await manager.delete(SpvMessage, { companyId });
      await manager.delete(Company, { id: companyId });
    });
  }

  async purgeAccountant(accountantId: number): Promise<void> {
    const companies = await this.dataSource.getRepository(Company).find({
      select: { id: true },
      where: { accountantId },
      withDeleted: true,
    });
    for (const { id } of companies) await this.purge(id);

    const messages = await this.dataSource.getRepository(SpvMessage).find({
      select: { id: true, storagePath: true },
      where: { accountantId, storagePath: Not(IsNull()) },
      withDeleted: true,
    });
    const spvPaths = storedPaths(messages);
    if (spvPaths.length) await this.spvFiles.remove(spvPaths);
    await this.connections.removeAll(accountantId);
    await this.dataSource
      .getRepository(Accountant)
      .delete({ id: accountantId });
  }

  private async unusedSpvPaths(paths: string[]): Promise<string[]> {
    if (!paths.length) return [];
    const live = await this.dataSource.getRepository(SpvMessage).find({
      select: { id: true, storagePath: true },
      where: { storagePath: In(paths) },
    });
    const used = new Set(storedPaths(live));
    return paths.filter((p) => !used.has(p));
  }
}

function storedPaths(rows: { storagePath: string | null }[]): string[] {
  return rows.flatMap((r) => (r.storagePath ? [r.storagePath] : []));
}
