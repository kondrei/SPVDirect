import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository, type SelectQueryBuilder } from 'typeorm';
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
import type { Company } from '../../companies/company.entity.js';
import { CompaniesService } from '../../companies/services/companies.service.js';
import {
  ARCHIVE_FILE_MISSING,
  ARCHIVE_LIST_COLUMNS,
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
  EinvoiceTypeCode,
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
import { EfacturaInvoice } from '../efactura-invoice.entity.js';
import { EfacturaUpload } from '../efactura-upload.entity.js';
import {
  directionOf,
  isInvoiceMessage,
  likePattern,
  toArchiveDetail,
  toArchiveItem,
} from '../helpers/archive-view.js';
import { extractInvoiceXml } from '../helpers/efactura-zip.js';
import { normalizeTaxId, parseEinvoice } from '../helpers/einvoice-parser.js';
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
    private readonly efactura: EfacturaService,
    private readonly api: AnafApiService,
    private readonly validator: EfacturaValidator,
    private readonly companies: CompaniesService,
    private readonly files: EfacturaFileStore,
    private readonly mailer: EfacturaArchiveMailer,
    @InjectRepository(EfacturaInvoice)
    private readonly archive: Repository<EfacturaInvoice>,
    @InjectRepository(EfacturaUpload)
    private readonly uploads: Repository<EfacturaUpload>,
    private readonly activity: ActivityLogsService,
  ) {}

  async importMessages(
    accountantId: number,
    companyId: number,
    messageIds: string[],
  ): Promise<ImportResult[]> {
    const company = await this.companies.get(accountantId, companyId);
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
    const company = await this.companies.get(accountantId, companyId);
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
    const [rows, total] = await this.filtered(accountantId, filter)
      .select(ARCHIVE_LIST_COLUMNS.map((column) => `e.${column}`))
      .orderBy('e.issueDate', 'DESC', 'NULLS LAST')
      .addOrderBy('e.id', 'DESC')
      .skip((filter.page - 1) * filter.pageSize)
      .take(filter.pageSize)
      .getManyAndCount();
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
    return this.archive.find({
      where: { accountantId, companyId },
      order: { issueDate: 'ASC', id: 'ASC' },
    });
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
    await this.mailer.send(row, input.to, input.message, attachments);
    await this.activity.record(
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
      const list = await this.efactura.fetchMessages(target, cui, {
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
    const rows = await this.archive
      .createQueryBuilder('e')
      .select('e.anafMessageId', 'anafMessageId')
      .where('e.companyId = :companyId', { companyId })
      .andWhere('e.environment = :environment', {
        environment: this.api.environment(),
      })
      .andWhere('e.anafMessageId IN (:...messageIds)', { messageIds })
      .getRawMany<{ anafMessageId: string }>();
    return new Set(rows.map((r) => r.anafMessageId));
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
    const environment = this.api.environment();
    const existing = await this.archive.findOne({
      select: { id: true },
      where: { companyId: company.id, environment, anafMessageId: item.id },
    });
    if (existing) {
      return {
        messageId: item.id,
        status: ImportStatus.Already,
        id: existing.id,
      };
    }
    const file = await this.efactura.fetchZip(target, environment, item.id);
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
    const row = this.archive.create({
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
    const upload = await this.uploads.findOne({
      select: { id: true, invoiceId: true },
      where: { companyId, environment, uploadIndex },
    });
    return upload?.invoiceId ?? null;
  }

  private async save(
    row: EfacturaInvoice,
    zip: Buffer,
  ): Promise<EfacturaInvoice | null> {
    if (this.files.enabled) {
      const path = this.files.pathFor(row, EfacturaFileKind.Zip);
      await this.files.put(path, zip, 'application/zip');
      row.zipStoragePath = path;
      row.zipContent = null;
    } else {
      row.zipStoragePath = null;
      row.zipContent = zip;
    }
    try {
      return await this.archive.manager.transaction(async (manager) => {
        await lockLiveCompany(manager, row.accountantId, row.companyId);
        return manager.getRepository(EfacturaInvoice).save(row);
      });
    } catch (err) {
      if (isUniqueViolation(err)) return null;
      if (row.zipStoragePath) {
        await this.files.remove([row.zipStoragePath]).catch(() => undefined);
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
    await this.activity.record(
      accountantId,
      efacturaArchiveImported(company, counts, automatic),
    );
  }

  private filtered(
    accountantId: number,
    filter: ArchiveFilter,
  ): SelectQueryBuilder<EfacturaInvoice> {
    const qb = this.archive
      .createQueryBuilder('e')
      .where('e.accountantId = :accountantId', { accountantId });
    if (filter.companyId) {
      qb.andWhere('e.companyId = :companyId', { companyId: filter.companyId });
    }
    if (filter.direction) {
      qb.andWhere('e.direction = :direction', { direction: filter.direction });
    }
    if (filter.from) qb.andWhere('e.issueDate >= :from', { from: filter.from });
    if (filter.to) qb.andWhere('e.issueDate <= :to', { to: filter.to });
    const search = filter.q?.trim();
    if (search) {
      const q = likePattern(search);
      const cui = likePattern(normalizeTaxId(search) ?? search);
      qb.andWhere(
        new Brackets((b) =>
          b
            .where('e.number ILIKE :q', { q })
            .orWhere('e.supplierName ILIKE :q', { q })
            .orWhere('e.customerName ILIKE :q', { q })
            .orWhere('e.supplierCui ILIKE :cui', { cui })
            .orWhere('e.customerCui ILIKE :cui', { cui }),
        ),
      );
    }
    return qb;
  }

  private async totals(
    accountantId: number,
    filter: ArchiveFilter,
  ): Promise<ArchiveTotal[]> {
    const rows = await this.filtered(accountantId, filter)
      .select('e.currency', 'currency')
      .addSelect('COUNT(*)', 'count')
      .addSelect(
        `SUM(CASE WHEN "e"."standard" = :creditStandard OR "e"."type_code" = :creditCode THEN -"e"."total_gross" ELSE "e"."total_gross" END)`,
        'total',
      )
      .setParameters({
        creditStandard: EfacturaStandard.CN,
        creditCode: EinvoiceTypeCode.CreditNote,
      })
      .andWhere('e.currency IS NOT NULL')
      .groupBy('e.currency')
      .orderBy('e.currency', 'ASC')
      .getRawMany<{ currency: string; count: string; total: string | null }>();
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
    const qb = this.archive
      .createQueryBuilder('e')
      .where('e.id = :id AND e.accountantId = :accountantId', {
        id,
        accountantId,
      });
    if (withFiles) qb.addSelect(['e.zipContent', 'e.pdfContent']);
    const row = await qb.getOne();
    if (!row) throw new NotFoundException(ARCHIVE_NOT_FOUND);
    return row;
  }

  private async stored(
    content: Buffer | null,
    path: string | null,
  ): Promise<Buffer | null> {
    if (content) return content;
    if (!path) return null;
    if (!this.files.configured) {
      throw new ConflictException(STORAGE_NOT_CONFIGURED);
    }
    return this.files.get(path);
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
    const file = await this.validator.transform(
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
      if (this.files.enabled) {
        const path = this.files.pathFor(row, EfacturaFileKind.Pdf);
        await this.files.put(path, pdf, 'application/pdf');
        await this.archive.update({ id: row.id }, { pdfStoragePath: path });
        row.pdfStoragePath = path;
      } else {
        await this.archive.update({ id: row.id }, { pdfContent: pdf });
      }
      row.pdfContent = this.files.enabled ? null : pdf;
    } catch (err) {
      this.logger.warn(
        `PDF of archived e-Factura ${row.id} not cached: ${(err as Error).message}`,
      );
    }
  }
}
