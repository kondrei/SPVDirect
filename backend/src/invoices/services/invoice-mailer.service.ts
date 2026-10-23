import { Injectable, Logger } from '@nestjs/common';
import { MailKind } from '../../common/dto/common.enums.js';
import { escapeHtml } from '../../common/html.js';
import {
  MailService,
  type MailMessage,
} from '../../common/mail/mail.service.js';
import type { Invoice } from '../invoice.entity.js';
import {
  formatAmount,
  formatIsoDate,
  invoiceFilename,
  stornoReference,
  invoiceNumber,
} from '../helpers/invoice-format.js';

@Injectable()
export class InvoiceMailer {
  private readonly logger = new Logger(InvoiceMailer.name);

  constructor(private readonly mailService: MailService) {}

  async send(invoice: Invoice, to: string, pdf: Buffer): Promise<void> {
    try {
      await this.mailService.send(this.message(invoice, to, pdf), {
        kind: MailKind.Invoice,
        accountantId: invoice.accountantId,
        companyId: invoice.companyId,
      });
    } catch (err) {
      this.logger.error(
        `Invoice ${invoice.id} email failed (accountant ${invoice.accountantId}): ${(err as Error).message}`,
      );
      throw err;
    }
  }

  message(invoice: Invoice, to: string, pdf: Buffer): MailMessage {
    const number = invoiceNumber(invoice.series, invoice.number);
    const storno = stornoReference(invoice) !== null;
    const what = storno ? 'factura de stornare' : 'factura';
    const total = `${formatAmount(invoice.totalGross)} ${invoice.currency}`;
    const issued = formatIsoDate(invoice.issueDate);
    const due = invoice.dueDate
      ? ` Scadența este ${formatIsoDate(invoice.dueDate)}.`
      : '';
    const seller = invoice.seller.name;
    const text = [
      'Bună ziua,',
      '',
      `Vă transmitem atașat ${what} ${number} din ${issued}, emisă de ${seller}, în valoare de ${total}.${due}`,
      '',
      'Vă mulțumim,',
      seller,
    ].join('\n');
    const html = `<p>Bună ziua,</p>
<p>Vă transmitem atașat ${escapeHtml(what)} <strong>${escapeHtml(number)}</strong> din ${escapeHtml(issued)}, emisă de ${escapeHtml(seller)}, în valoare de <strong>${escapeHtml(total)}</strong>.${escapeHtml(due)}</p>
<p>Vă mulțumim,<br>${escapeHtml(seller)}</p>`;
    return {
      to,
      replyTo: invoice.seller.email ?? undefined,
      subject: `${storno ? 'Factura de stornare' : 'Factura'} ${number} de la ${seller}`,
      text,
      html,
      attachments: [
        {
          filename: invoiceFilename(invoice.series, invoice.number),
          content: pdf,
          contentType: 'application/pdf',
        },
      ],
    };
  }
}
