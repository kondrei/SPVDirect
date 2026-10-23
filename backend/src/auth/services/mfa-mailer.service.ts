import { Injectable, Logger } from '@nestjs/common';
import { MailKind } from '../../common/dto/common.enums.js';
import { escapeHtml } from '../../common/html.js';
import { MailService } from '../../common/mail/mail.service.js';
import {
  MFA_EMAIL_CODE_SUBJECT,
  MFA_EMAIL_CODE_TTL_MS,
  MFA_MAIL,
  MFA_MAIL_FOOTER,
} from '../dto/auth.constants.js';
import type { MfaEvent } from '../dto/auth.enums.js';

@Injectable()
export class MfaMailer {
  private readonly logger = new Logger(MfaMailer.name);

  constructor(private readonly mailService: MailService) {}

  async notify(
    accountantId: number,
    email: string,
    event: MfaEvent,
  ): Promise<void> {
    const { subject, text } = MFA_MAIL[event];
    try {
      await this.mailService.send(
        {
          to: email,
          subject,
          text: `${text}\n\n${MFA_MAIL_FOOTER}`,
          html: `<p>${escapeHtml(text)}</p>\n<p>${escapeHtml(MFA_MAIL_FOOTER)}</p>`,
        },
        { kind: MailKind.MfaChanged, accountantId, companyId: null },
      );
    } catch (err) {
      this.logger.error(
        `Email ${MailKind.MfaChanged} (${event}) for accountant ${accountantId} failed: ${(err as Error).message}`,
      );
    }
  }

  async sendCode(
    accountantId: number,
    email: string,
    code: string,
  ): Promise<void> {
    const minutes = MFA_EMAIL_CODE_TTL_MS / 60_000;
    const text = `Codul dvs. de verificare SPVDirect este ${code}. Este valabil ${minutes} minute și poate fi folosit o singură dată.`;
    const warning =
      'Dacă nu ați încercat dvs. să intrați în cont, ignorați acest email și schimbați parola.';
    await this.mailService.send(
      {
        to: email,
        subject: MFA_EMAIL_CODE_SUBJECT,
        text: `${text}\n\n${warning}`,
        html: `<p>Codul dvs. de verificare SPVDirect este <strong style="font-size:20px;letter-spacing:2px">${escapeHtml(code)}</strong>.</p>
<p>Este valabil ${minutes} minute și poate fi folosit o singură dată.</p>
<p>${escapeHtml(warning)}</p>`,
      },
      { kind: MailKind.MfaCode, accountantId, companyId: null },
    );
  }
}
