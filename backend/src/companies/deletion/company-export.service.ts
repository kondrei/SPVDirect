import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { companyExported } from '../../api-logs/activity-entries.js';
import { ActivityLogsService } from '../../api-logs/activity-logs.service.js';
import { SpvArchiveService } from '../../anaf/spv/services/spv-archive.service.js';
import { SpvMessageRepository } from '../../anaf/spv/repositories/spv-message.repository.js';
import type { DownloadFile } from '../../common/download-file.js';
import type { EfacturaInvoice } from '../../efactura/efactura-invoice.entity.js';
import type { EfacturaUpload } from '../../efactura/efactura-upload.entity.js';
import type { Invoice } from '../../invoices/invoice.entity.js';
import type { SpvMessage } from '../../anaf/spv/spv-message.entity.js';
import { EfacturaUploadRepository } from '../../efactura/repositories/efactura-upload.repository.js';
import { EfacturaArchiveService } from '../../efactura/services/efactura-archive.service.js';
import { InvoiceRepository } from '../../invoices/repositories/invoice.repository.js';
import { InvoiceDeliveryService } from '../../invoices/services/invoice-delivery.service.js';
import type { Company } from '../company.entity.js';
import { CompaniesService } from '../services/companies.service.js';
import { toCsv, type CsvValue } from './csv.js';
import { ZipStream } from './zip-stream.js';
import {
  EFACTURA_ARCHIVE_HEADER,
  INVOICE_HEADER,
  SPV_HEADER,
  UPLOAD_HEADER,
  companyExportFilename,
} from '../dto/company.constants.js';
import { CompanyExportFile, LogoContentType } from '../dto/company.enums.js';
import type { CompanyExport } from '../dto/company.types.js';

@Injectable()
export class CompanyExportService {
  private readonly logger = new Logger(CompanyExportService.name);

  constructor(
    private readonly companiesService: CompaniesService,
    private readonly invoiceRepository: InvoiceRepository,
    private readonly efacturaUploadRepository: EfacturaUploadRepository,
    private readonly spvMessageRepository: SpvMessageRepository,
    private readonly invoiceDeliveryService: InvoiceDeliveryService,
    private readonly spvArchiveService: SpvArchiveService,
    private readonly efacturaArchiveService: EfacturaArchiveService,
    private readonly activityLogsService: ActivityLogsService,
  ) {}

  async export(
    accountantId: number,
    id: number,
    now = new Date(),
  ): Promise<CompanyExport> {
    const company = await this.companiesService.get(accountantId, id);
    await this.activityLogsService.record(
      accountantId,
      companyExported(company),
    );
    const zip = new ZipStream();
    void this.stream(zip, `company ${company.id}`, async (errors) => {
      await this.writeCompany(zip, company, '', errors);
    });
    return {
      content: zip.output,
      contentType: 'application/zip',
      filename: companyExportFilename(company.cui, now),
    };
  }

  async stream(
    zip: ZipStream,
    label: string,
    write: (errors: string[]) => Promise<void>,
  ): Promise<void> {
    const errors: string[] = [];
    try {
      await write(errors);
      if (!zip.output.destroyed) {
        if (errors.length)
          zip.add(CompanyExportFile.Errors, `${errors.join('\n')}\n`);
        zip.end();
      }
    } catch (err) {
      this.logger.error(`Export of ${label} failed: ${(err as Error).message}`);
      zip.fail(err as Error);
    }
  }

  async writeCompany(
    zip: ZipStream,
    company: Company,
    prefix: string,
    errors: string[],
  ): Promise<boolean> {
    const accountantId = company.accountantId;
    const [invoices, uploads, archived, messages] = await Promise.all([
      this.invoiceRepository.forCompany(accountantId, company.id),
      this.efacturaUploadRepository.forCompany(accountantId, company.id),
      this.efacturaArchiveService.forCompany(accountantId, company.id),
      this.spvMessageRepository.ofCompany(company),
    ]);

    zip.add(`${prefix}${CompanyExportFile.Company}`, json(company));
    await this.addLogo(zip, errors, company, prefix);

    zip.add(`${prefix}${CompanyExportFile.Invoices}`, json(invoices));
    zip.add(
      `${prefix}${CompanyExportFile.InvoiceList}`,
      toCsv(
        INVOICE_HEADER,
        invoices.map((i) => invoiceRow(i)),
      ),
    );
    const invoiceFolder = `${prefix}${CompanyExportFile.InvoicesFolder}`;
    for (const invoice of invoices) {
      if (!(await zip.ready())) return false;
      await this.addFile(zip, errors, invoiceFolder, false, () =>
        this.invoiceDeliveryService.pdf(accountantId, invoice.id),
      );
      await this.addFile(zip, errors, invoiceFolder, true, () =>
        this.invoiceDeliveryService.xml(accountantId, invoice.id),
      );
    }

    zip.add(
      `${prefix}${CompanyExportFile.Uploads}`,
      toCsv(
        UPLOAD_HEADER,
        uploads.map((u) => uploadRow(u)),
      ),
    );
    zip.add(
      `${prefix}${CompanyExportFile.EfacturaArchiveList}`,
      toCsv(
        EFACTURA_ARCHIVE_HEADER,
        archived.map((a) => archiveRow(a)),
      ),
    );
    const archiveFolder = `${prefix}${CompanyExportFile.EfacturaArchiveFolder}`;
    for (const row of archived) {
      if (!(await zip.ready())) return false;
      await this.addFile(zip, errors, archiveFolder, false, () =>
        this.efacturaArchiveService.zip(accountantId, row.id),
      );
    }
    return this.writeSpv(
      zip,
      accountantId,
      messages,
      `${prefix}${CompanyExportFile.Spv}`,
      errors,
    );
  }

  async writeSpv(
    zip: ZipStream,
    accountantId: number,
    messages: SpvMessage[],
    name: string,
    errors: string[],
  ): Promise<boolean> {
    zip.add(
      `${name}.csv`,
      toCsv(
        SPV_HEADER,
        messages.map((m) => spvRow(m)),
      ),
    );
    for (const message of messages) {
      if (!message.downloadedAt) continue;
      if (!(await zip.ready())) return false;
      await this.addFile(zip, errors, name, false, () =>
        this.spvArchiveService.download(accountantId, message.id),
      );
    }
    return true;
  }

  private async addLogo(
    zip: ZipStream,
    errors: string[],
    company: Company,
    prefix: string,
  ): Promise<void> {
    if (!company.logoContentType) return;
    try {
      const logo = await this.companiesService.getLogo(
        company.accountantId,
        company.id,
      );
      const ext = logo.contentType === LogoContentType.Png ? 'png' : 'jpg';
      zip.add(`${prefix}${CompanyExportFile.Logo}.${ext}`, logo.content, false);
    } catch (err) {
      if (err instanceof NotFoundException) return;
      errors.push(
        `${prefix}${CompanyExportFile.Logo}: ${(err as Error).message}`,
      );
    }
  }

  private async addFile(
    zip: ZipStream,
    errors: string[],
    folder: string,
    compress: boolean,
    load: () => Promise<DownloadFile>,
  ): Promise<void> {
    try {
      const file = await load();
      zip.add(`${folder}/${file.filename}`, file.content, compress);
    } catch (err) {
      errors.push(`${folder}: ${(err as Error).message}`);
    }
  }
}

export function json(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function invoiceRow(i: Invoice): CsvValue[] {
  return [
    i.id,
    i.series,
    i.number,
    i.issueDate,
    i.deliveryDate,
    i.dueDate,
    i.currency,
    i.buyer.name,
    i.buyer.cui,
    i.totalNet,
    i.totalVat,
    i.totalGross,
    i.stornoOfSeries ? `${i.stornoOfSeries}-${i.stornoOfNumber}` : null,
    i.createdAt,
  ];
}

function uploadRow(u: EfacturaUpload): CsvValue[] {
  return [
    u.id,
    u.invoiceId,
    u.environment,
    u.standard,
    u.uploadIndex,
    u.status,
    u.downloadId,
    u.errorMessage,
    u.checkedAt,
    u.createdAt,
  ];
}

function archiveRow(a: EfacturaInvoice): CsvValue[] {
  return [
    a.id,
    a.anafMessageId,
    a.uploadIndex,
    a.environment,
    a.direction,
    a.standard,
    a.typeCode,
    a.number,
    a.issueDate,
    a.dueDate,
    a.currency,
    a.supplierName,
    a.supplierCui,
    a.customerName,
    a.customerCui,
    a.totalNet,
    a.totalVat,
    a.totalGross,
    a.invoiceId,
    a.parseError,
    a.createdAt,
  ];
}

function spvRow(m: SpvMessage): CsvValue[] {
  return [
    m.id,
    m.anafMessageId,
    m.cif,
    m.type,
    m.details,
    m.requestId,
    m.anafCreatedRaw,
    m.downloadedAt,
  ];
}
