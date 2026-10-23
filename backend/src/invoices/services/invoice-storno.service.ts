import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { lockLiveCompany } from '../../companies/company-lock.js';
import { CompanyRepository } from '../../companies/repositories/company.repository.js';
import type { CreateStornoDto } from '../dto/invoice.dto.js';
import { validateInvoiceDates } from '../builders/invoice-builder.js';
import { computeInvoice } from '../helpers/invoice-calc.js';
import { bucharestToday } from '../helpers/invoice-format.js';
import {
  buildStornoLines,
  remainingQuantities,
} from '../helpers/invoice-storno.js';
import type { Invoice } from '../invoice.entity.js';
import { InvoiceRepository } from '../repositories/invoice.repository.js';
import { InvoiceDeliveryService } from './invoice-delivery.service.js';
import type { CreatedInvoice } from '../dto/invoice.types.js';
import { INVOICE_NOT_FOUND } from './invoice-lookup.js';
import { InvoiceNumbering } from './invoice-numbering.service.js';

@Injectable()
export class InvoiceStornoService {
  constructor(
    private readonly invoiceNumbering: InvoiceNumbering,
    private readonly invoiceDeliveryService: InvoiceDeliveryService,
    private readonly invoiceRepository: InvoiceRepository,
    private readonly companyRepository: CompanyRepository,
  ) {}

  async createStorno(
    accountantId: number,
    id: number,
    dto: CreateStornoDto,
  ): Promise<CreatedInvoice> {
    this.invoiceDeliveryService.assertCanDeliver(dto);
    const issueDate = dto.issueDate ?? bucharestToday();
    validateInvoiceDates({ issueDate, deliveryDate: issueDate });

    const invoice = await this.invoiceNumbering.insert((manager) =>
      this.buildStorno(manager, accountantId, id, dto, issueDate),
    );
    return this.invoiceDeliveryService.deliverNew(invoice, dto);
  }

  private async buildStorno(
    manager: EntityManager,
    accountantId: number,
    id: number,
    dto: CreateStornoDto,
    issueDate: string,
  ): Promise<Invoice> {
    const target = await this.invoiceRepository.findRef(
      manager,
      accountantId,
      id,
    );
    if (!target) throw new NotFoundException(INVOICE_NOT_FOUND);
    await lockLiveCompany(
      this.companyRepository,
      manager,
      accountantId,
      target.companyId,
    );
    const original = await this.invoiceRepository.findForUpdate(
      manager,
      accountantId,
      id,
    );
    if (!original) throw new NotFoundException(INVOICE_NOT_FOUND);
    if (original.stornoOfInvoiceId !== null) {
      throw new BadRequestException(
        'O factură de stornare nu poate fi stornată',
      );
    }
    if (issueDate < original.issueDate) {
      throw new BadRequestException(
        'Factura de stornare nu poate fi emisă înaintea facturii stornate',
      );
    }
    const remaining = remainingQuantities(
      original,
      await this.invoiceRepository.stornosOf(accountantId, id, manager),
    );
    const computed = computeInvoice(
      buildStornoLines(original, remaining, dto.lines),
      original.exchangeRate,
    );
    return this.invoiceRepository.create({
      accountantId,
      companyId: original.companyId,
      series: dto.series ?? original.series,
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
    });
  }
}
