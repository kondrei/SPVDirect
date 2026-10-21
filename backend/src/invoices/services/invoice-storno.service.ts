import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Repository } from 'typeorm';
import { lockLiveCompany } from '../../companies/company-lock.js';
import type { CreateStornoDto } from '../dto/invoice.dto.js';
import { validateInvoiceDates } from '../builders/invoice-builder.js';
import { computeInvoice } from '../helpers/invoice-calc.js';
import { bucharestToday } from '../helpers/invoice-format.js';
import {
  buildStornoLines,
  remainingQuantities,
} from '../helpers/invoice-storno.js';
import { Invoice } from '../invoice.entity.js';
import {
  InvoiceDeliveryService,
  type CreatedInvoice,
} from './invoice-delivery.service.js';
import { INVOICE_NOT_FOUND } from './invoice-lookup.js';
import { InvoiceNumbering } from './invoice-numbering.service.js';

@Injectable()
export class InvoiceStornoService {
  constructor(
    private readonly numbering: InvoiceNumbering,
    private readonly delivery: InvoiceDeliveryService,
  ) {}

  async createStorno(
    accountantId: number,
    id: number,
    dto: CreateStornoDto,
  ): Promise<CreatedInvoice> {
    this.delivery.assertCanDeliver(dto);
    const issueDate = dto.issueDate ?? bucharestToday();
    validateInvoiceDates({ issueDate, deliveryDate: issueDate });

    const invoice = await this.numbering.insert((invoices) =>
      this.buildStorno(invoices, accountantId, id, dto, issueDate),
    );
    return this.delivery.deliverNew(invoice, dto);
  }

  private async buildStorno(
    invoices: Repository<Invoice>,
    accountantId: number,
    id: number,
    dto: CreateStornoDto,
    issueDate: string,
  ): Promise<Invoice> {
    const target = await invoices.findOne({
      select: { id: true, companyId: true },
      where: { id, accountantId },
    });
    if (!target) throw new NotFoundException(INVOICE_NOT_FOUND);
    await lockLiveCompany(invoices.manager, accountantId, target.companyId);
    const original = await invoices.findOne({
      where: { id, accountantId },
      lock: { mode: 'pessimistic_write' },
    });
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
      await invoices.findBy({ accountantId, stornoOfInvoiceId: id }),
    );
    const computed = computeInvoice(
      buildStornoLines(original, remaining, dto.lines),
      original.exchangeRate,
    );
    return invoices.create({
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
