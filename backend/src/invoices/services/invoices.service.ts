import { BadRequestException, Injectable } from '@nestjs/common';
import { CompaniesService } from '../../companies/services/companies.service.js';
import type { CreateInvoiceDto } from '../dto/invoice.dto.js';
import {
  buyerFromDto,
  normalizeLines,
  sellerFromCompany,
  validateInvoiceDates,
} from '../builders/invoice-builder.js';
import { renderInvoiceXml } from '../builders/invoice-xml.js';
import { computeInvoice } from '../helpers/invoice-calc.js';
import { bucharestToday } from '../helpers/invoice-format.js';
import { remainingQuantities } from '../helpers/invoice-storno.js';
import {
  computeInvoiceStats,
  statsWindowStart,
  type InvoiceStats,
} from '../helpers/invoice-stats.js';
import type { Invoice } from '../invoice.entity.js';
import { InvoiceRepository } from '../repositories/invoice.repository.js';
import { InvoiceDeliveryService } from './invoice-delivery.service.js';
import type {
  CreatedInvoice,
  InvoiceSummary,
  InvoicePage,
  InvoiceDetail,
  InvoiceListFilter,
} from '../dto/invoice.types.js';
import { findOwnedInvoice } from './invoice-lookup.js';
import { InvoiceNumbering } from './invoice-numbering.service.js';
import { Currency } from '../dto/invoice.enums.js';

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
  constructor(
    private readonly invoiceRepository: InvoiceRepository,
    private readonly companiesService: CompaniesService,
    private readonly invoiceNumbering: InvoiceNumbering,
    private readonly invoiceDeliveryService: InvoiceDeliveryService,
  ) {}

  async nextNumber(
    accountantId: number,
    companyId: number,
    series: string,
  ): Promise<number> {
    await this.companiesService.get(accountantId, companyId);
    return this.invoiceNumbering.next(companyId, series);
  }

  async list(
    accountantId: number,
    filter: InvoiceListFilter,
  ): Promise<InvoicePage> {
    const [rows, total] = await this.invoiceRepository.page(
      accountantId,
      filter,
    );
    const reversed = rows.length
      ? new Set(
          (
            await this.invoiceRepository.stornoTargets(
              accountantId,
              rows.map((r) => r.id),
            )
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
    const rows = await this.invoiceRepository.issuedSince(
      accountantId,
      statsWindowStart(today),
    );
    return computeInvoiceStats(rows, today);
  }

  get(accountantId: number, id: number): Promise<Invoice> {
    return findOwnedInvoice(this.invoiceRepository, accountantId, id);
  }

  async xml(accountantId: number, id: number): Promise<string> {
    return renderInvoiceXml(await this.get(accountantId, id));
  }

  async detail(accountantId: number, id: number): Promise<InvoiceDetail> {
    const invoice = await this.get(accountantId, id);
    const remaining =
      invoice.stornoOfInvoiceId === null
        ? remainingQuantities(
            invoice,
            await this.invoiceRepository.stornosOf(accountantId, id),
          )
        : null;
    return Object.assign(invoice, { remainingQuantities: remaining });
  }

  async create(
    accountantId: number,
    dto: CreateInvoiceDto,
  ): Promise<CreatedInvoice> {
    const company = await this.companiesService.get(
      accountantId,
      dto.companyId,
    );
    validateInvoiceDates(dto);
    if (dto.currency !== Currency.RON && !dto.exchangeRate) {
      throw new BadRequestException(
        'Introduceți cursul de schimb BNR pentru a calcula TVA în RON',
      );
    }
    this.invoiceDeliveryService.assertCanDeliver(dto);

    const seller = sellerFromCompany(company);
    const lines = normalizeLines(dto.lines, seller.vatPayer, dto.deliveryDate);
    const exchangeRate =
      dto.currency === Currency.RON ? null : (dto.exchangeRate ?? null);
    const computed = computeInvoice(lines, exchangeRate);

    const invoice = await this.invoiceNumbering.insert(
      () =>
        Promise.resolve(
          this.invoiceRepository.create({
            accountantId,
            companyId: company.id,
            series: dto.series,
            issueDate: dto.issueDate,
            deliveryDate: dto.deliveryDate,
            dueDate: dto.dueDate ?? null,
            currency: dto.currency,
            exchangeRate,
            paymentMethod: dto.paymentMethod,
            vatOnCollection:
              seller.vatPayer && company.vatOnCollection === true,
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
        ),
      dto.number,
    );
    return this.invoiceDeliveryService.deliverNew(invoice, dto);
  }
}
