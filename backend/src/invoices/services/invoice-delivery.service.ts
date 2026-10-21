import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  invoiceIssued,
  invoiceSent,
  invoiceStored,
} from '../../api-logs/activity-entries.js';
import { ActivityLogsService } from '../../api-logs/activity-logs.service.js';

import { CompaniesService } from '../../companies/services/companies.service.js';
import { renderInvoicePdf } from '../builders/invoice-pdf.js';
import type { InvoiceLogo } from '../dto/invoice.types.js';
import { renderInvoiceXml } from '../builders/invoice-xml.js';
import { invoiceFilename } from '../helpers/invoice-format.js';
import { Invoice } from '../invoice.entity.js';
import { InvoiceFileStore } from './invoice-file-store.service.js';
import { findOwnedInvoice } from './invoice-lookup.js';
import { InvoiceMailer } from './invoice-mailer.service.js';
import type {
  InvoiceFile,
  DeliveryOptions,
  CreatedInvoice,
} from '../dto/invoice.types.js';

export const STORAGE_NOT_CONFIGURED =
  'Salvarea în Supabase Storage nu este configurată (SUPABASE_URL și SUPABASE_SERVICE_KEY).';

@Injectable()
export class InvoiceDeliveryService {
  private readonly logger = new Logger(InvoiceDeliveryService.name);

  constructor(
    @InjectRepository(Invoice)
    private readonly invoices: Repository<Invoice>,
    private readonly companies: CompaniesService,
    private readonly store: InvoiceFileStore,
    private readonly mailer: InvoiceMailer,
    private readonly activity: ActivityLogsService,
  ) {}

  assertCanDeliver(options: DeliveryOptions): void {
    if (options.saveToStorage && !this.store.configured) {
      throw new BadRequestException(STORAGE_NOT_CONFIGURED);
    }
  }

  async deliverNew(
    invoice: Invoice,
    options: DeliveryOptions,
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
    await this.activity.record(
      invoice.accountantId,
      invoiceIssued(invoice, {
        emailedTo:
          options.sendToEmail && !emailError ? options.sendToEmail : null,
        stored: !!options.saveToStorage && !storageError,
      }),
    );
    return { invoice, storageError, emailError };
  }

  async pdf(accountantId: number, id: number): Promise<InvoiceFile> {
    const invoice = await findOwnedInvoice(this.invoices, accountantId, id);
    return {
      content: await this.pdfFor(invoice),
      contentType: 'application/pdf',
      filename: invoiceFilename(invoice.series, invoice.number),
    };
  }

  async xml(accountantId: number, id: number): Promise<InvoiceFile> {
    const invoice = await findOwnedInvoice(this.invoices, accountantId, id);
    return {
      content: Buffer.from(renderInvoiceXml(invoice), 'utf8'),
      contentType: 'application/xml',
      filename: invoiceFilename(invoice.series, invoice.number).replace(
        /\.pdf$/,
        '.xml',
      ),
    };
  }

  async saveToStorage(accountantId: number, id: number): Promise<Invoice> {
    this.assertCanDeliver({ saveToStorage: true });
    const invoice = await findOwnedInvoice(this.invoices, accountantId, id);
    await this.putInStorage(invoice, await this.renderPdf(invoice));
    await this.activity.record(accountantId, invoiceStored(invoice));
    return invoice;
  }

  async send(
    accountantId: number,
    id: number,
    to: string | null | undefined,
  ): Promise<Invoice> {
    const invoice = await findOwnedInvoice(this.invoices, accountantId, id);
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
    await this.activity.record(accountantId, invoiceSent(invoice, recipient));
    return invoice;
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
