import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, MoreThanOrEqual, Repository } from 'typeorm';
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
import { Invoice } from '../invoice.entity.js';
import { InvoiceDeliveryService } from './invoice-delivery.service.js';
import type { CreatedInvoice } from '../dto/invoice.types.js';
import { findOwnedInvoice } from './invoice-lookup.js';
import { InvoiceNumbering } from './invoice-numbering.service.js';
import { Currency } from '../dto/invoice.enums.js';
import type {
  InvoiceSummary,
  InvoicePage,
  InvoiceDetail,
} from '../dto/invoice.types.js';

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
    @InjectRepository(Invoice)
    private readonly invoices: Repository<Invoice>,
    private readonly companies: CompaniesService,
    private readonly numbering: InvoiceNumbering,
    private readonly delivery: InvoiceDeliveryService,
  ) {}

  async nextNumber(
    accountantId: number,
    companyId: number,
    series: string,
  ): Promise<number> {
    await this.companies.get(accountantId, companyId);
    return this.numbering.next(companyId, series);
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

  get(accountantId: number, id: number): Promise<Invoice> {
    return findOwnedInvoice(this.invoices, accountantId, id);
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
            await this.invoices.findBy({ accountantId, stornoOfInvoiceId: id }),
          )
        : null;
    return Object.assign(invoice, { remainingQuantities: remaining });
  }

  async create(
    accountantId: number,
    dto: CreateInvoiceDto,
  ): Promise<CreatedInvoice> {
    const company = await this.companies.get(accountantId, dto.companyId);
    validateInvoiceDates(dto);
    if (dto.currency !== Currency.RON && !dto.exchangeRate) {
      throw new BadRequestException(
        'Introduceți cursul de schimb BNR pentru a calcula TVA în RON',
      );
    }
    this.delivery.assertCanDeliver(dto);

    const seller = sellerFromCompany(company);
    const lines = normalizeLines(dto.lines, seller.vatPayer, dto.deliveryDate);
    const exchangeRate =
      dto.currency === Currency.RON ? null : (dto.exchangeRate ?? null);
    const computed = computeInvoice(lines, exchangeRate);

    const invoice = await this.numbering.insert(
      (invoices) =>
        Promise.resolve(
          invoices.create({
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
    return this.delivery.deliverNew(invoice, dto);
  }
}
