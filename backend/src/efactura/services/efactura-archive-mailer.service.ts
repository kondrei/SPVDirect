import { Injectable, Logger } from '@nestjs/common';
import { ApiLogsService } from '../../api-logs/api-logs.service.js';
import { trackApiCall } from '../../api-logs/track-api-call.js';
import { escapeHtml } from '../../common/html.js';
import {
  MailService,
  smtpErrorCode,
  type MailAttachment,
  type MailMessage,
} from '../../common/mail/mail.service.js';
import {
  ApiLogService,
  ApiLogMethod,
} from '../../api-logs/dto/api-log.enums.js';
import { formatAmount } from '../../invoices/helpers/invoice-format.js';
import { ARCHIVE_MAIL_LOG_ENDPOINT } from '../dto/efactura.constants.js';
import type { EfacturaInvoice } from '../efactura-invoice.entity.js';

@Injectable()
export class EfacturaArchiveMailer {
  private readonly logger = new Logger(EfacturaArchiveMailer.name);

  constructor(
    private readonly mail: MailService,
    private readonly apiLogs: ApiLogsService,
  ) {}

  async send(
    invoice: EfacturaInvoice,
    to: string,
    note: string | undefined,
    attachments: MailAttachment[],
  ): Promise<void> {
    await trackApiCall(
      this.apiLogs,
      {
        accountantId: invoice.accountantId,
        anafConnectionId: null,
        companyId: invoice.companyId,
        service: ApiLogService.Smtp,
        method: ApiLogMethod.Send,
        endpoint: ARCHIVE_MAIL_LOG_ENDPOINT,
      },
      async (outcome) => {
        try {
          outcome.statusCode = await this.mail.send(
            this.message(invoice, to, note, attachments),
          );
        } catch (err) {
          outcome.statusCode = smtpErrorCode(err);
          outcome.error = (err as Error).message;
          this.logger.error(
            `Archived e-Factura ${invoice.id} email failed (accountant ${invoice.accountantId}): ${outcome.error}`,
          );
          throw err;
        }
      },
    );
  }

  message(
    invoice: EfacturaInvoice,
    to: string,
    note: string | undefined,
    attachments: MailAttachment[],
  ): MailMessage {
    const number = invoice.number ?? invoice.anafMessageId;
    const parts = [
      `factura ${number}`,
      invoice.issueDate ? `din ${invoice.issueDate}` : null,
      invoice.supplierName ? `emisă de ${invoice.supplierName}` : null,
      invoice.customerName ? `către ${invoice.customerName}` : null,
      invoice.totalGross === null
        ? null
        : `în valoare de ${formatAmount(invoice.totalGross)} ${invoice.currency ?? ''}`.trim(),
    ].filter((part) => part !== null);
    const summary = `Vă transmitem atașat ${parts.join(', ')}, așa cum a fost înregistrată în sistemul RO e-Factura.`;
    const message = note?.trim() ?? '';
    const text = [
      'Bună ziua,',
      '',
      ...(message ? [message, ''] : []),
      summary,
      '',
      'Arhiva ZIP conține fișierul XML original și semnătura ANAF.',
    ].join('\n');
    const noteHtml = message
      ? `<p>${escapeHtml(message).replaceAll('\n', '<br>')}</p>\n`
      : '';
    const html = `<p>Bună ziua,</p>
${noteHtml}<p>${escapeHtml(summary)}</p>
<p>Arhiva ZIP conține fișierul XML original și semnătura ANAF.</p>`;
    const from = invoice.supplierName ? ' de la ' + invoice.supplierName : '';
    return {
      to,
      subject: `Factura ${number}${from}`.replaceAll(/\s+/g, ' '),
      text,
      html,
      attachments,
    };
  }
}
