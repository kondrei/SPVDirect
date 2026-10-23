import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import type { DataSource } from 'typeorm';
import {
  efacturaArchiveEmailed,
  efacturaArchiveImported,
} from '../../api-logs/activity-entries.js';
import { ActivityLogsService } from '../../api-logs/activity-logs.service.js';
import { AnafApiService } from '../../anaf/services/anaf-api.service.js';
import { isUniqueViolation } from '../../common/db-errors.js';
import type { DownloadFile } from '../../common/download-file.js';
import type { MailAttachment } from '../../common/mail/mail.service.js';
import { lockLiveCompany } from '../../companies/company-lock.js';
import { CompanyRepository } from '../../companies/repositories/company.repository.js';
import type { Company } from '../../companies/company.entity.js';
import { CompaniesService } from '../../companies/services/companies.service.js';
import {
  ARCHIVE_FILE_MISSING,
  ARCHIVE_NOT_FOUND,
  DAY_MS,
  IMPORT_FAILED,
  IMPORT_PERIOD_BATCH,
  MAX_MESSAGE_PAGES,
  NOT_AN_INVOICE,
  NOT_A_PARTY,
  PDF_ONLY_UBL,
  PERIOD_MARGIN_MS,
  STORAGE_NOT_CONFIGURED,
  archiveFilename,
} from '../dto/efactura.constants.js';
import {
  EfacturaDirection,
  EfacturaFileKind,
  EfacturaStandard,
  ImportStatus,
  ValidateStandard,
} from '../dto/efactura.enums.js';
import type {
  AnafTarget,
  ArchiveDetail,
  ArchiveEmail,
  ArchiveFilter,
  ArchivePage,
  ArchiveTotal,
  ImportCounts,
  ImportItem,
  ImportPeriodResult,
  ImportResult,
} from '../dto/efactura.types.js';
import type { EfacturaInvoice } from '../efactura-invoice.entity.js';
import { EfacturaInvoiceRepository } from '../repositories/efactura-invoice.repository.js';
import { EfacturaUploadRepository } from '../repositories/efactura-upload.repository.js';
import {
  directionOf,
  isInvoiceMessage,
  toArchiveDetail,
  toArchiveItem,
} from '../helpers/archive-view.js';
import { extractInvoiceXml } from '../helpers/efactura-zip.js';
import { parseEinvoice } from '../helpers/einvoice-parser.js';
import { EfacturaArchiveMailer } from './efactura-archive-mailer.service.js';
import { EfacturaFileStore } from './efactura-file-store.service.js';
import { EfacturaValidator } from './efactura-validator.service.js';
import { EfacturaService, certified } from './efactura.service.js';

function failureReason(err: unknown): string {
  if (err instanceof HttpException) {
    const body = err.getResponse();
    const message =
      typeof body === 'object' && 'message' in body
        ? (body as { message: unknown }).message
        : body;
    if (typeof message === 'string') return message;
  }
  return IMPORT_FAILED;
}

function stopsBatch(err: unknown): boolean {
  if (!(err instanceof HttpException)) return false;
  const status = err.getStatus();
  return (
    status >= 500 ||
    status === HttpStatus.TOO_MANY_REQUESTS ||
    status === HttpStatus.NOT_FOUND
  );
}

function countResults(results: ImportResult[]): ImportCounts {
  const counts: ImportCounts = {
    [ImportStatus.Imported]: 0,
    [ImportStatus.Already]: 0,
    [ImportStatus.Skipped]: 0,
    [ImportStatus.Failed]: 0,
  };
  for (const result of results) counts[result.status]++;
  return counts;
}

@Injectable()
export class EfacturaArchiveService {
  private readonly logger = new Logger(EfacturaArchiveService.name);

  constructor(
    private readonly efacturaService: EfacturaService,
    private readonly anafApiService: AnafApiService,
    private readonly efacturaValidator: EfacturaValidator,
    private readonly companiesService: CompaniesService,
    private readonly efacturaFileStore: EfacturaFileStore,
    private readonly efacturaArchiveMailer: EfacturaArchiveMailer,
    private readonly efacturaInvoiceRepository: EfacturaInvoiceRepository,
    private readonly efacturaUploadRepository: EfacturaUploadRepository,
    private readonly activityLogsService: ActivityLogsService,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly companyRepository: CompanyRepository,
  ) {}

  async importMessages(
    accountantId: number,
    companyId: number,
    messageIds: string[],
  ): Promise<ImportResult[]> {
    const company = await this.companiesService.get(accountantId, companyId);
    const results = await this.importAll(
      accountantId,
      company,
      messageIds.map((id) => ({ id, hint: null })),
    );
    await this.recordImport(accountantId, company, results, false);
    return results;
  }

  async importPeriod(
    accountantId: number,
    companyId: number,
    days: number,
    automatic = false,
  ): Promise<ImportPeriodResult> {
    const company = await this.companiesService.get(accountantId, companyId);
    const { connectionId, cui } = certified(company);
    const candidates = await this.invoiceMessages(
      { accountantId, connectionId, companyId },
      cui,
      days,
    );
    const archived = await this.archivedIds(
      companyId,
      candidates.map((c) => c.id),
    );
    const pending = candidates.filter((c) => !archived.has(c.id));
    const batch = pending.slice(0, IMPORT_PERIOD_BATCH);
    const results = await this.importAll(accountantId, company, batch);
    await this.recordImport(accountantId, company, results, automatic);
    return {
      found: candidates.length,
      remaining: pending.length - batch.length,
      results,
    };
  }

  async list(
    accountantId: number,
    filter: ArchiveFilter,
  ): Promise<ArchivePage> {
    const [rows, total] = await this.efacturaInvoiceRepository.page(
      accountantId,
      filter,
    );
    return {
      items: rows.map((row) => toArchiveItem(row)),
      total,
      page: filter.page,
      pageSize: filter.pageSize,
      totals: await this.totals(accountantId, filter),
    };
  }

  async get(accountantId: number, id: number): Promise<ArchiveDetail> {
    return toArchiveDetail(await this.row(accountantId, id));
  }

  async forCompany(
    accountantId: number,
    companyId: number,
  ): Promise<EfacturaInvoice[]> {
    return this.efacturaInvoiceRepository.forCompany(accountantId, companyId);
  }

  async zip(accountantId: number, id: number): Promise<DownloadFile> {
    const row = await this.row(accountantId, id, true);
    return {
      content: await this.zipContent(row),
      contentType: 'application/zip',
      filename: archiveFilename(row, EfacturaFileKind.Zip),
    };
  }

  async xml(accountantId: number, id: number): Promise<DownloadFile> {
    const row = await this.row(accountantId, id, true);
    return {
      content: Buffer.from(await this.invoiceXml(row), 'utf8'),
      contentType: 'application/xml',
      filename: archiveFilename(row, EfacturaFileKind.Xml),
    };
  }

  async pdf(accountantId: number, id: number): Promise<DownloadFile> {
    const row = await this.row(accountantId, id, true);
    return {
      content: await this.pdfContent(row),
      contentType: 'application/pdf',
      filename: archiveFilename(row, EfacturaFileKind.Pdf),
    };
  }

  async email(
    accountantId: number,
    id: number,
    input: ArchiveEmail,
  ): Promise<{ to: string; withPdf: boolean }> {
    const row = await this.row(accountantId, id, true);
    const attachments: MailAttachment[] = [];
    try {
      attachments.push({
        filename: archiveFilename(row, EfacturaFileKind.Pdf),
        content: await this.pdfContent(row),
        contentType: 'application/pdf',
      });
    } catch (err) {
      if (!(err instanceof HttpException)) throw err;
      this.logger.warn(
        `Archived e-Factura ${row.id} emailed without PDF: ${err.message}`,
      );
    }
    attachments.push({
      filename: archiveFilename(row, EfacturaFileKind.Zip),
      content: await this.zipContent(row),
      contentType: 'application/zip',
    });
    await this.efacturaArchiveMailer.send(
      row,
      input.to,
      input.message,
      attachments,
    );
    await this.activityLogsService.record(
      accountantId,
      efacturaArchiveEmailed(row, input.to),
    );
    return { to: input.to, withPdf: attachments.length > 1 };
  }

  private async invoiceMessages(
    target: AnafTarget,
    cui: string,
    days: number,
  ): Promise<ImportItem[]> {
    const endTime = Date.now();
    const startTime = endTime - days * DAY_MS + PERIOD_MARGIN_MS;
    const items: ImportItem[] = [];
    for (let page = 1; page <= MAX_MESSAGE_PAGES; page++) {
      const list = await this.efacturaService.fetchMessages(target, cui, {
        startTime,
        endTime,
        pagina: page,
      });
      for (const message of list.messages) {
        if (!isInvoiceMessage(message)) continue;
        items.push({
          id: message.id,
          hint: {
            type: message.type,
            requestId: message.requestId,
            createdAt: message.createdAt,
          },
        });
      }
      if (!list.pages || page >= list.pages) break;
    }
    return items;
  }

  private async archivedIds(
    companyId: number,
    messageIds: string[],
  ): Promise<Set<string>> {
    if (!messageIds.length) return new Set();
    return new Set(
      await this.efacturaInvoiceRepository.archivedMessageIds(
        companyId,
        this.anafApiService.environment(),
        messageIds,
      ),
    );
  }

  private async importAll(
    accountantId: number,
    company: Company,
    items: ImportItem[],
  ): Promise<ImportResult[]> {
    if (!items.length) return [];
    const { connectionId } = certified(company);
    const target = { accountantId, connectionId, companyId: company.id };
    const results: ImportResult[] = [];
    let stopped: string | null = null;
    for (const item of items) {
      if (stopped) {
        results.push({
          messageId: item.id,
          status: ImportStatus.Failed,
          reason: stopped,
        });
        continue;
      }
      try {
        results.push(await this.importOne(target, company, item));
      } catch (err) {
        const reason = failureReason(err);
        if (!(err instanceof HttpException)) {
          this.logger.error(
            `Import of e-Factura message ${item.id} failed: ${(err as Error).message}`,
          );
        }
        results.push({
          messageId: item.id,
          status: ImportStatus.Failed,
          reason,
        });
        if (stopsBatch(err)) stopped = reason;
      }
    }
    return results;
  }

  private async importOne(
    target: AnafTarget,
    company: Company,
    item: ImportItem,
  ): Promise<ImportResult> {
    const environment = this.anafApiService.environment();
    const existing = await this.efacturaInvoiceRepository.findIdByMessage(
      company.id,
      environment,
      item.id,
    );
    if (existing) {
      return {
        messageId: item.id,
        status: ImportStatus.Already,
        id: existing.id,
      };
    }
    const file = await this.efacturaService.fetchZip(
      target,
      environment,
      item.id,
    );
    const extracted = extractInvoiceXml(file.content);
    const parsed = extracted ? parseEinvoice(extracted.xml) : null;
    if (!extracted || !parsed) {
      return {
        messageId: item.id,
        status: ImportStatus.Skipped,
        reason: NOT_AN_INVOICE,
      };
    }
    const direction = directionOf(parsed, company.cui, item.hint?.type ?? null);
    if (!direction) {
      return {
        messageId: item.id,
        status: ImportStatus.Skipped,
        reason: NOT_A_PARTY,
      };
    }
    const uploadIndex = item.hint?.requestId ?? extracted.uploadIndex;
    const row = this.efacturaInvoiceRepository.create({
      accountantId: target.accountantId,
      companyId: company.id,
      anafConnectionId: target.connectionId,
      environment,
      anafMessageId: item.id,
      uploadIndex,
      messageCreatedAt: item.hint?.createdAt
        ? new Date(item.hint.createdAt)
        : null,
      direction,
      standard: parsed.standard,
      typeCode: parsed.typeCode,
      number: parsed.number?.slice(0, 100) ?? null,
      issueDate: parsed.issueDate,
      dueDate: parsed.dueDate,
      currency: parsed.currency?.slice(0, 3) ?? null,
      supplierCui: parsed.supplier.cui,
      supplierName: parsed.supplier.name,
      customerCui: parsed.customer.cui,
      customerName: parsed.customer.name,
      totalNet: parsed.totalNet,
      totalVat: parsed.totalVat,
      totalGross: parsed.totalGross,
      lines: parsed.lines,
      parseError: parsed.incomplete,
      invoiceId:
        direction === EfacturaDirection.Sent && uploadIndex
          ? await this.ownInvoice(company.id, environment, uploadIndex)
          : null,
    });
    const saved = await this.save(row, file.content);
    return saved
      ? { messageId: item.id, status: ImportStatus.Imported, id: saved.id }
      : { messageId: item.id, status: ImportStatus.Already };
  }

  private async ownInvoice(
    companyId: number,
    environment: EfacturaInvoice['environment'],
    uploadIndex: string,
  ): Promise<number | null> {
    const upload = await this.efacturaUploadRepository.findByIndex(
      companyId,
      environment,
      uploadIndex,
    );
    return upload?.invoiceId ?? null;
  }

  private async save(
    row: EfacturaInvoice,
    zip: Buffer,
  ): Promise<EfacturaInvoice | null> {
    if (this.efacturaFileStore.enabled) {
      const path = this.efacturaFileStore.pathFor(row, EfacturaFileKind.Zip);
      await this.efacturaFileStore.put(path, zip, 'application/zip');
      row.zipStoragePath = path;
      row.zipContent = null;
    } else {
      row.zipStoragePath = null;
      row.zipContent = zip;
    }
    try {
      return await this.dataSource.transaction(async (manager) => {
        await lockLiveCompany(
          this.companyRepository,
          manager,
          row.accountantId,
          row.companyId,
        );
        return this.efacturaInvoiceRepository.insert(manager, row);
      });
    } catch (err) {
      if (isUniqueViolation(err)) return null;
      if (row.zipStoragePath) {
        await this.efacturaFileStore
          .remove([row.zipStoragePath])
          .catch(() => undefined);
      }
      throw err;
    }
  }

  private async recordImport(
    accountantId: number,
    company: Company,
    results: ImportResult[],
    automatic: boolean,
  ): Promise<void> {
    const counts = countResults(results);
    if (!counts[ImportStatus.Imported] && !counts[ImportStatus.Failed]) return;
    await this.activityLogsService.record(
      accountantId,
      efacturaArchiveImported(company, counts, automatic),
    );
  }

  private async totals(
    accountantId: number,
    filter: ArchiveFilter,
  ): Promise<ArchiveTotal[]> {
    const rows = await this.efacturaInvoiceRepository.totals(
      accountantId,
      filter,
    );
    return rows.map((r) => ({
      currency: r.currency,
      count: Number(r.count),
      total: Number(r.total ?? 0),
    }));
  }

  private async row(
    accountantId: number,
    id: number,
    withFiles = false,
  ): Promise<EfacturaInvoice> {
    const row = await this.efacturaInvoiceRepository.findOwned(
      accountantId,
      id,
      withFiles,
    );
    if (!row) throw new NotFoundException(ARCHIVE_NOT_FOUND);
    return row;
  }

  private async stored(
    content: Buffer | null,
    path: string | null,
  ): Promise<Buffer | null> {
    if (content) return content;
    if (!path) return null;
    if (!this.efacturaFileStore.configured) {
      throw new ConflictException(STORAGE_NOT_CONFIGURED);
    }
    return this.efacturaFileStore.get(path);
  }

  private async zipContent(row: EfacturaInvoice): Promise<Buffer> {
    const zip = await this.stored(row.zipContent, row.zipStoragePath);
    if (!zip) throw new ConflictException(ARCHIVE_FILE_MISSING);
    return zip;
  }

  private async invoiceXml(row: EfacturaInvoice): Promise<string> {
    const extracted = extractInvoiceXml(await this.zipContent(row));
    if (!extracted) throw new ConflictException(ARCHIVE_FILE_MISSING);
    return extracted.xml;
  }

  private async pdfContent(row: EfacturaInvoice): Promise<Buffer> {
    const cached = await this.stored(row.pdfContent, row.pdfStoragePath);
    if (cached) return cached;
    if (row.standard === EfacturaStandard.CII) {
      throw new BadRequestException(PDF_ONLY_UBL);
    }
    const file = await this.efacturaValidator.transform(
      row.accountantId,
      await this.invoiceXml(row),
      row.standard === EfacturaStandard.CN
        ? ValidateStandard.FCN
        : ValidateStandard.FACT1,
      true,
    );
    await this.cachePdf(row, file.content);
    return file.content;
  }

  private async cachePdf(row: EfacturaInvoice, pdf: Buffer): Promise<void> {
    try {
      if (this.efacturaFileStore.enabled) {
        const path = this.efacturaFileStore.pathFor(row, EfacturaFileKind.Pdf);
        await this.efacturaFileStore.put(path, pdf, 'application/pdf');
        await this.efacturaInvoiceRepository.update(row.id, {
          pdfStoragePath: path,
        });
        row.pdfStoragePath = path;
      } else {
        await this.efacturaInvoiceRepository.update(row.id, {
          pdfContent: pdf,
        });
      }
      row.pdfContent = this.efacturaFileStore.enabled ? null : pdf;
    } catch (err) {
      this.logger.warn(
        `PDF of archived e-Factura ${row.id} not cached: ${(err as Error).message}`,
      );
    }
  }
}
