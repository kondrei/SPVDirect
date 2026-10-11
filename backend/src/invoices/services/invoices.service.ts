import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, MoreThanOrEqual, Repository } from 'typeorm';
import { isUniqueViolation } from '../../common/db-errors.js';
import { AnafCompanyLookupService } from '../../companies/services/anaf-company-lookup.service.js';
import {
  CUI_NOT_FOUND,
  CompaniesService,
} from '../../companies/services/companies.service.js';
import type { CreateInvoiceDto, CreateStornoDto } from '../dto/invoice.dto.js';
import {
  buyerFromAnaf,
  buyerFromDto,
  normalizeLines,
  sellerFromCompany,
  validateInvoiceDates,
  type BuyerLookup,
} from '../builders/invoice-builder.js';
import { computeInvoice } from '../helpers/invoice-calc.js';
import { InvoiceFileStore } from './invoice-file-store.service.js';
import { bucharestToday, invoiceFilename } from '../helpers/invoice-format.js';
import { buildStornoLines, remainingQuantities } from '../helpers/invoice-storno.js';
import {
  computeInvoiceStats,
  statsWindowStart,
  type InvoiceStats,
} from '../helpers/invoice-stats.js';
import { InvoiceMailer } from './invoice-mailer.service.js';
import { renderInvoicePdf, type InvoiceLogo } from '../builders/invoice-pdf.js';
import { renderInvoiceXml } from '../builders/invoice-xml.js';
import { Invoice } from '../invoice.entity.js';

export const NUMBER_RETRIES = 3;
export const STORAGE_NOT_CONFIGURED =
  'Salvarea în Supabase Storage nu este configurată (SUPABASE_URL și SUPABASE_SERVICE_KEY).';

export interface InvoiceSummary {
  id: number;
  companyId: number;
  series: string;
  number: number;
  issueDate: string;
  dueDate: string | null;
  sellerName: string;
  buyerName: string;
  buyerCui: string | null;
  currency: string;
  totalGross: number;
  stored: boolean;
  stornoOfInvoiceId: number | null;
  stornoOfSeries: string | null;
  stornoOfNumber: number | null;
  stornoed: boolean;
  emailedTo: string | null;
  emailedAt: string | null;
}

export interface InvoicePage {
  items: InvoiceSummary[];
  total: number;
  page: number;
  pageSize: number;
}

export interface CreatedInvoice {
  invoice: Invoice;
  storageError: string | null;
  emailError: string | null;
}

export type InvoiceDetail = Invoice & {
  remainingQuantities: number[] | null;
};

export interface InvoiceFile {
  content: Buffer | string;
  contentType: string;
  filename: string;
}

function toSummary(invoice: Invoice, stornoed: boolean): InvoiceSummary {
  return {
    id: invoice.id,
    companyId: invoice.companyId,
    series: invoice.series,
    number: invoice.number,
    issueDate: invoice.issueDate,
    dueDate: invoice.dueDate,
    sellerName: invoice.seller.name,
    buyerName: invoice.buyer.name,
    buyerCui: invoice.buyer.cui,
    currency: invoice.currency,
    totalGross: invoice.totalGross,
    stored: invoice.storagePath !== null,
    stornoOfInvoiceId: invoice.stornoOfInvoiceId,
    stornoOfSeries: invoice.stornoOfSeries,
    stornoOfNumber: invoice.stornoOfNumber,
    stornoed,
    emailedTo: invoice.emailedTo,
    emailedAt: invoice.emailedAt?.toISOString() ?? null,
  };
}

@Injectable()
export class InvoicesService {
  private readonly logger = new Logger(InvoicesService.name);

  constructor(
    @InjectRepository(Invoice)
    private readonly invoices: Repository<Invoice>,
    private readonly companies: CompaniesService,
    private readonly anaf: AnafCompanyLookupService,
    private readonly store: InvoiceFileStore,
    private readonly mailer: InvoiceMailer,
  ) {}

  async lookupBuyer(accountantId: number, cui: string): Promise<BuyerLookup> {
    const record = await this.anaf.lookup(accountantId, cui);
    if (!record) throw new BadRequestException(CUI_NOT_FOUND);
    return buyerFromAnaf(record);
  }

  async nextNumber(
    accountantId: number,
    companyId: number,
    series: string,
  ): Promise<number> {
    await this.companies.get(accountantId, companyId);
    return (
      ((await this.invoices.maximum('number', { companyId, series })) ?? 0) + 1
    );
  }

  async list(
    accountantId: number,
    filter: { companyId?: number; page: number; pageSize: number },
  ): Promise<InvoicePage> {
    const [rows, total] = await this.invoices.findAndCount({
      where: {
        accountantId,
        ...(filter.companyId ? { companyId: filter.companyId } : {}),
      },
      order: { issueDate: 'DESC', id: 'DESC' },
      skip: (filter.page - 1) * filter.pageSize,
      take: filter.pageSize,
    });
    const reversed = rows.length
      ? new Set(
          (
            await this.invoices.find({
              select: { stornoOfInvoiceId: true },
              where: {
                accountantId,
                stornoOfInvoiceId: In(rows.map((r) => r.id)),
              },
            })
          ).map((r) => r.stornoOfInvoiceId),
        )
      : new Set<number | null>();
    return {
      items: rows.map((r) => toSummary(r, reversed.has(r.id))),
      total,
      page: filter.page,
      pageSize: filter.pageSize,
    };
  }

  async stats(accountantId: number): Promise<InvoiceStats> {
    const today = bucharestToday();
    const rows = await this.invoices.find({
      select: {
        issueDate: true,
        currency: true,
        exchangeRate: true,
        totalNet: true,
        totalVatRon: true,
        stornoOfInvoiceId: true,
      },
      where: {
        accountantId,
        issueDate: MoreThanOrEqual(statsWindowStart(today)),
      },
    });
    return computeInvoiceStats(rows, today);
  }

  async get(accountantId: number, id: number): Promise<Invoice> {
    const invoice = await this.invoices.findOneBy({ id, accountantId });
    if (!invoice) throw new NotFoundException('Factura nu a fost găsită');
    return invoice;
  }

  async detail(accountantId: number, id: number): Promise<InvoiceDetail> {
    const invoice = await this.get(accountantId, id);
    const remaining =
      invoice.stornoOfInvoiceId === null
        ? remainingQuantities(invoice, await this.stornosOf(accountantId, id))
        : null;
    return Object.assign(invoice, { remainingQuantities: remaining });
  }

  async create(
    accountantId: number,
    dto: CreateInvoiceDto,
  ): Promise<CreatedInvoice> {
    const company = await this.companies.get(accountantId, dto.companyId);
    validateInvoiceDates(dto);
    if (dto.currency !== 'RON' && !dto.exchangeRate) {
      throw new BadRequestException(
        'Introduceți cursul de schimb BNR pentru a calcula TVA în RON',
      );
    }
    if (dto.saveToStorage && !this.store.configured) {
      throw new BadRequestException(STORAGE_NOT_CONFIGURED);
    }

    const seller = sellerFromCompany(company);
    const lines = normalizeLines(dto.lines, seller.vatPayer, dto.deliveryDate);
    const exchangeRate =
      dto.currency === 'RON' ? null : (dto.exchangeRate ?? null);
    const computed = computeInvoice(lines, exchangeRate);

    const invoice = await this.saveWithNumber(
      { companyId: company.id, series: dto.series, number: dto.number },
      () =>
        this.invoices.create({
          accountantId,
          companyId: company.id,
          series: dto.series,
          issueDate: dto.issueDate,
          deliveryDate: dto.deliveryDate,
          dueDate: dto.dueDate ?? null,
          currency: dto.currency,
          exchangeRate,
          paymentMethod: dto.paymentMethod,
          vatOnCollection: seller.vatPayer && company.vatOnCollection === true,
          seller,
          buyer: buyerFromDto(dto.buyer),
          lines: computed.lines,
          vatBreakdown: computed.totals.breakdown,
          totalNet: computed.totals.net,
          totalVat: computed.totals.vat,
          totalGross: computed.totals.gross,
          totalVatRon: computed.totals.vatRon,
          stornoOfInvoiceId: null,
          stornoOfSeries: null,
          stornoOfNumber: null,
          stornoOfIssueDate: null,
          notes: dto.notes ?? null,
        }),
    );
    return this.followUp(invoice, dto);
  }

  async createStorno(
    accountantId: number,
    id: number,
    dto: CreateStornoDto,
  ): Promise<CreatedInvoice> {
    const original = await this.get(accountantId, id);
    if (original.stornoOfInvoiceId !== null) {
      throw new BadRequestException(
        'O factură de stornare nu poate fi stornată',
      );
    }
    if (dto.saveToStorage && !this.store.configured) {
      throw new BadRequestException(STORAGE_NOT_CONFIGURED);
    }
    const issueDate = dto.issueDate ?? bucharestToday();
    validateInvoiceDates({ issueDate, deliveryDate: issueDate });
    if (issueDate < original.issueDate) {
      throw new BadRequestException(
        'Factura de stornare nu poate fi emisă înaintea facturii stornate',
      );
    }

    const remaining = remainingQuantities(
      original,
      await this.stornosOf(accountantId, id),
    );
    const lines = buildStornoLines(original, remaining, dto.lines);
    const computed = computeInvoice(lines, original.exchangeRate);
    const series = dto.series ?? original.series;

    const invoice = await this.saveWithNumber(
      { companyId: original.companyId, series },
      () =>
        this.invoices.create({
          accountantId,
          companyId: original.companyId,
          series,
          issueDate,
          deliveryDate: issueDate,
          dueDate: null,
          currency: original.currency,
          exchangeRate: original.exchangeRate,
          paymentMethod: original.paymentMethod,
          vatOnCollection: original.vatOnCollection,
          seller: original.seller,
          buyer: original.buyer,
          lines: computed.lines,
          vatBreakdown: computed.totals.breakdown,
          totalNet: computed.totals.net,
          totalVat: computed.totals.vat,
          totalGross: computed.totals.gross,
          totalVatRon: computed.totals.vatRon,
          stornoOfInvoiceId: original.id,
          stornoOfSeries: original.series,
          stornoOfNumber: original.number,
          stornoOfIssueDate: original.issueDate,
          notes: dto.notes ?? null,
        }),
    );
    return this.followUp(invoice, dto);
  }

  private stornosOf(accountantId: number, id: number): Promise<Invoice[]> {
    return this.invoices.findBy({ accountantId, stornoOfInvoiceId: id });
  }

  private async followUp(
    invoice: Invoice,
    options: { saveToStorage?: boolean; sendToEmail?: string | null },
  ): Promise<CreatedInvoice> {
    let storageError: string | null = null;
    let emailError: string | null = null;
    if (options.saveToStorage || options.sendToEmail) {
      const pdf = await this.renderPdf(invoice);
      if (options.saveToStorage) {
        storageError = await this.attempt(
          () => this.putInStorage(invoice, pdf),
          'Factura a fost creată, dar nu a putut fi salvată în Storage. Reîncercați din listă.',
        );
      }
      if (options.sendToEmail) {
        const to = options.sendToEmail;
        emailError = await this.attempt(
          () => this.mailAndRecord(invoice, to, pdf),
          'Factura a fost creată, dar emailul nu a putut fi trimis. Reîncercați din listă.',
        );
      }
    }
    return { invoice, storageError, emailError };
  }

  async download(accountantId: number, id: number): Promise<InvoiceFile> {
    const invoice = await this.get(accountantId, id);
    return {
      content: await this.pdfFor(invoice),
      contentType: 'application/pdf',
      filename: invoiceFilename(invoice.series, invoice.number),
    };
  }

  async downloadXml(accountantId: number, id: number): Promise<InvoiceFile> {
    const invoice = await this.get(accountantId, id);
    return {
      content: renderInvoiceXml(invoice),
      contentType: 'application/xml',
      filename: invoiceFilename(invoice.series, invoice.number).replace(
        /\.pdf$/,
        '.xml',
      ),
    };
  }

  async saveToStorage(accountantId: number, id: number): Promise<Invoice> {
    if (!this.store.configured) {
      throw new BadRequestException(STORAGE_NOT_CONFIGURED);
    }
    const invoice = await this.get(accountantId, id);
    await this.putInStorage(invoice, await this.renderPdf(invoice));
    return invoice;
  }

  async send(
    accountantId: number,
    id: number,
    to: string | null | undefined,
  ): Promise<Invoice> {
    const invoice = await this.get(accountantId, id);
    const recipient = to ?? invoice.buyer.email;
    if (!recipient) {
      throw new BadRequestException(
        'Introduceți adresa de email a destinatarului',
      );
    }
    try {
      await this.mailAndRecord(invoice, recipient, await this.pdfFor(invoice));
    } catch (err) {
      if (err instanceof BadGatewayException) throw err;
      throw new BadGatewayException(
        'Emailul nu a putut fi trimis. Verificați adresa și reîncercați.',
      );
    }
    return invoice;
  }

  private async saveWithNumber(
    target: { companyId: number; series: string; number?: number },
    build: () => Invoice,
  ): Promise<Invoice> {
    for (let attempt = 1; ; attempt++) {
      const invoice = build();
      invoice.number =
        target.number ??
        ((await this.invoices.maximum('number', {
          companyId: target.companyId,
          series: target.series,
        })) ?? 0) + 1;
      try {
        return await this.invoices.save(invoice);
      } catch (err) {
        if (!isUniqueViolation(err)) throw err;
        if (target.number !== undefined || attempt >= NUMBER_RETRIES) {
          throw new ConflictException(
            `Factura ${target.series} ${invoice.number} există deja pentru această firmă`,
          );
        }
      }
    }
  }

  private async logoFor(invoice: Invoice): Promise<InvoiceLogo | null> {
    try {
      return await this.companies.getLogo(
        invoice.accountantId,
        invoice.companyId,
      );
    } catch (err) {
      if (err instanceof NotFoundException) return null;
      throw err;
    }
  }

  private async renderPdf(invoice: Invoice): Promise<Buffer> {
    return renderInvoicePdf(invoice, await this.logoFor(invoice));
  }

  private async pdfFor(invoice: Invoice): Promise<Buffer> {
    if (invoice.storagePath && this.store.configured) {
      try {
        return await this.store.get(invoice.storagePath);
      } catch (err) {
        this.logger.warn(
          `Invoice ${invoice.id} not read from storage, regenerating: ${(err as Error).message}`,
        );
      }
    }
    return this.renderPdf(invoice);
  }

  private async putInStorage(invoice: Invoice, pdf: Buffer): Promise<void> {
    const path = this.store.pathFor(
      invoice.accountantId,
      invoice.companyId,
      invoice.series,
      invoice.number,
    );
    await this.store.put(path, pdf);
    await this.invoices.update({ id: invoice.id }, { storagePath: path });
    invoice.storagePath = path;
  }

  private async mailAndRecord(
    invoice: Invoice,
    to: string,
    pdf: Buffer,
  ): Promise<void> {
    await this.mailer.send(invoice, to, pdf);
    const emailedAt = new Date();
    await this.invoices.update(
      { id: invoice.id },
      { emailedTo: to, emailedAt },
    );
    invoice.emailedTo = to;
    invoice.emailedAt = emailedAt;
  }

  private async attempt(
    action: () => Promise<void>,
    failure: string,
  ): Promise<string | null> {
    try {
      await action();
      return null;
    } catch (err) {
      this.logger.warn(`Invoice follow-up failed: ${(err as Error).message}`);
      return failure;
    }
  }
}
