import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository, type EntityManager } from 'typeorm';
import { ACTIVE_UPLOAD_STATUSES, UploadStatus } from '../dto/efactura.enums.js';
import type { UploadListFilter } from '../dto/efactura.types.js';
import { EfacturaUpload } from '../efactura-upload.entity.js';

@Injectable()
export class EfacturaUploadRepository {
  constructor(
    @InjectRepository(EfacturaUpload)
    private readonly efacturaUploadRepository: Repository<EfacturaUpload>,
  ) {}

  insert(data: Partial<EfacturaUpload>): Promise<EfacturaUpload> {
    return this.efacturaUploadRepository.save(
      this.efacturaUploadRepository.create(data),
    );
  }

  insertClaim(
    manager: EntityManager,
    data: Partial<EfacturaUpload>,
  ): Promise<EfacturaUpload> {
    const uploads = manager.getRepository(EfacturaUpload);
    return uploads.save(uploads.create(data));
  }

  save(upload: EfacturaUpload): Promise<EfacturaUpload> {
    return this.efacturaUploadRepository.save(upload);
  }

  async deleteSending(id: number): Promise<void> {
    await this.efacturaUploadRepository.delete({
      id,
      status: UploadStatus.Sending,
    });
  }

  async markInterrupted(id: number, errorMessage: string): Promise<void> {
    await this.efacturaUploadRepository.update(
      { id, status: UploadStatus.Sending },
      { status: UploadStatus.Rejected, errorMessage },
    );
  }

  findOwned(accountantId: number, id: number): Promise<EfacturaUpload | null> {
    return this.efacturaUploadRepository.findOneBy({ id, accountantId });
  }

  findActive(
    accountantId: number,
    invoiceId: number,
  ): Promise<EfacturaUpload | null> {
    return this.efacturaUploadRepository.findOne({
      where: {
        accountantId,
        invoiceId,
        status: In([...ACTIVE_UPLOAD_STATUSES]),
      },
    });
  }

  page(
    accountantId: number,
    filter: UploadListFilter,
  ): Promise<[EfacturaUpload[], number]> {
    return this.efacturaUploadRepository.findAndCount({
      where: {
        accountantId,
        ...(filter.companyId ? { companyId: filter.companyId } : {}),
        ...(filter.invoiceId ? { invoiceId: filter.invoiceId } : {}),
      },
      order: { id: 'DESC' },
      skip: (filter.page - 1) * filter.pageSize,
      take: filter.pageSize,
    });
  }

  newestFirstForInvoices(
    accountantId: number,
    invoiceIds: number[],
  ): Promise<EfacturaUpload[]> {
    return this.efacturaUploadRepository.find({
      where: { accountantId, invoiceId: In(invoiceIds) },
      order: { id: 'DESC' },
    });
  }

  forCompany(
    accountantId: number,
    companyId: number,
  ): Promise<EfacturaUpload[]> {
    return this.efacturaUploadRepository.find({
      where: { accountantId, companyId },
      order: { id: 'ASC' },
    });
  }

  findByIndex(
    companyId: number,
    environment: EfacturaUpload['environment'],
    uploadIndex: string,
  ): Promise<Pick<EfacturaUpload, 'id' | 'invoiceId'> | null> {
    return this.efacturaUploadRepository.findOne({
      select: { id: true, invoiceId: true },
      where: { companyId, environment, uploadIndex },
    });
  }

  countOk(): Promise<number> {
    return this.efacturaUploadRepository.countBy({ status: UploadStatus.Ok });
  }

  sendingForCompany(
    manager: EntityManager,
    companyId: number,
  ): Promise<boolean> {
    return manager.existsBy(EfacturaUpload, {
      companyId,
      status: UploadStatus.Sending,
    });
  }

  sendingForAccountant(
    manager: EntityManager,
    accountantId: number,
  ): Promise<boolean> {
    return manager.existsBy(EfacturaUpload, {
      accountantId,
      status: UploadStatus.Sending,
    });
  }

  async softDeleteOfCompany(
    manager: EntityManager,
    companyId: number,
  ): Promise<void> {
    await manager.softDelete(EfacturaUpload, { companyId });
  }

  async softDeleteOfAccountant(
    manager: EntityManager,
    accountantId: number,
  ): Promise<void> {
    await manager.softDelete(EfacturaUpload, { accountantId });
  }

  async purgeCompany(manager: EntityManager, companyId: number): Promise<void> {
    await manager.delete(EfacturaUpload, { companyId });
  }
}
