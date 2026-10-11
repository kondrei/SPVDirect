import { Injectable, Logger } from '@nestjs/common';
import { ApiLogsService } from '../../api-logs/api-logs.service.js';
import { escapeHtml } from '../../common/html.js';
import {
  MailService,
  smtpErrorCode,
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

export const INVOICE_MAIL_LOG_SERVICE = 'SMTP';
export const INVOICE_MAIL_LOG_ENDPOINT = 'invoice';

@Injectable()
export class InvoiceMailer {
  private readonly logger = new Logger(InvoiceMailer.name);

  constructor(
    private readonly mail: MailService,
    private readonly apiLogs: ApiLogsService,
  ) {}

  async send(invoice: Invoice, to: string, pdf: Buffer): Promise<void> {
    const started = performance.now();
    let statusCode: number | null = null;
    let error: string | null = null;
    try {
      statusCode = await this.mail.send(this.message(invoice, to, pdf));
    } catch (err) {
      statusCode = smtpErrorCode(err);
      error = (err as Error).message;
      this.logger.error(
        `Invoice ${invoice.id} email failed (accountant ${invoice.accountantId}): ${error}`,
      );
      throw err;
    } finally {
      await this.apiLogs.record({
        accountantId: invoice.accountantId,
        anafConnectionId: null,
        companyId: invoice.companyId,
        service: INVOICE_MAIL_LOG_SERVICE,
        method: 'SEND',
        endpoint: INVOICE_MAIL_LOG_ENDPOINT,
        statusCode,
        responseTimeMs: Math.round(performance.now() - started),
        error,
      });
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
