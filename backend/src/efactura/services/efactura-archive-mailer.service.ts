import { Injectable, Logger } from '@nestjs/common';
import { MailKind } from '../../common/dto/common.enums.js';
import { escapeHtml } from '../../common/html.js';
import {
  MailService,
  type MailAttachment,
  type MailMessage,
} from '../../common/mail/mail.service.js';
import { formatAmount } from '../../invoices/helpers/invoice-format.js';
import type { EfacturaInvoice } from '../efactura-invoice.entity.js';

@Injectable()
export class EfacturaArchiveMailer {
  private readonly logger = new Logger(EfacturaArchiveMailer.name);

  constructor(private readonly mail: MailService) {}

  async send(
    invoice: EfacturaInvoice,
    to: string,
    note: string | undefined,
    attachments: MailAttachment[],
  ): Promise<void> {
    try {
      await this.mail.send(this.message(invoice, to, note, attachments), {
        kind: MailKind.EfacturaArchive,
        accountantId: invoice.accountantId,
        companyId: invoice.companyId,
      });
    } catch (err) {
      this.logger.error(
        `Archived e-Factura ${invoice.id} email failed (accountant ${invoice.accountantId}): ${(err as Error).message}`,
      );
      throw err;
    }
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
