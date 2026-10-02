import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Accountant } from '../../accountants/accountant.entity.js';
import { ApiLogsService } from '../../api-logs/api-logs.service.js';
import { escapeHtml } from '../../common/html.js';
import {
  MailService,
  smtpErrorCode,
  type MailMessage,
} from '../../common/mail/mail.service.js';
import type { Env } from '../../config/env.validation.js';

export const MAIL_LOG_SERVICE = 'SMTP';
export type RegistrationMail = 'admin-approval' | 'approval-notice';

export interface AdminApprovalRequest {
  accountantId: number;
  email: string;
  name: string | null;
  approvalToken: string;
}

@Injectable()
export class RegistrationMailer {
  private readonly logger = new Logger(RegistrationMailer.name);

  constructor(
    private readonly config: ConfigService<Env, true>,
    private readonly mail: MailService,
    private readonly apiLogs: ApiLogsService,
    @InjectRepository(Accountant)
    private readonly accountants: Repository<Accountant>,
  ) {}

  async notifyAdmin(request: AdminApprovalRequest): Promise<boolean> {
    const sent = await this.send(
      request.accountantId,
      'admin-approval',
      this.adminMessage(request),
    );
    if (!sent) return false;
    try {
      await this.accountants.update(
        { id: request.accountantId },
        { adminNotifiedAt: new Date() },
      );
    } catch (err) {
      this.logger.error(
        `Could not mark accountant ${request.accountantId} as notified: ${(err as Error).message}`,
      );
    }
    return true;
  }

  notifyApproved(accountantId: number, email: string): Promise<boolean> {
    const loginUrl = `${this.config.get('FRONTEND_URL', { infer: true })}/login`;
    return this.send(accountantId, 'approval-notice', {
      to: email,
      subject: 'Contul SPVDirect a fost aprobat',
      text: `Contul dvs. SPVDirect a fost aprobat. Vă puteți autentifica la ${loginUrl}`,
      html: `<p>Contul dvs. SPVDirect a fost aprobat.</p>
<p><a href="${escapeHtml(loginUrl)}">Autentificați-vă</a></p>`,
    });
  }

  private async send(
    accountantId: number,
    kind: RegistrationMail,
    message: MailMessage,
  ): Promise<boolean> {
    const started = performance.now();
    let statusCode: number | null = null;
    let error: string | null = null;
    try {
      statusCode = await this.mail.send(message);
      return true;
    } catch (err) {
      statusCode = smtpErrorCode(err);
      error = (err as Error).message;
      this.logger.error(
        `Email ${kind} for accountant ${accountantId} failed: ${error}`,
      );
      return false;
    } finally {
      await this.apiLogs.record({
        accountantId,
        anafConnectionId: null,
        companyId: null,
        service: MAIL_LOG_SERVICE,
        method: 'SEND',
        endpoint: kind,
        statusCode,
        responseTimeMs: Math.round(performance.now() - started),
        error,
      });
    }
  }

  private adminMessage(request: AdminApprovalRequest): MailMessage {
    const base = `${this.config.get('API_URL', { infer: true })}/auth/registrations/${request.approvalToken}`;
    const approveUrl = `${base}/approve`;
    const rejectUrl = `${base}/reject`;
    const name = request.name ?? '(fără nume)';
    return {
      to: this.config.get('ADMIN_EMAIL', { infer: true }),
      subject: `Cerere cont nou SPVDirect: ${request.email}`,
      text: [
        `${name} <${request.email}> dorește să creeze un cont SPVDirect.`,
        '',
        `Aprobă: ${approveUrl}`,
        `Respinge (adresa va fi blocată): ${rejectUrl}`,
      ].join('\n'),
      html: `<p><strong>${escapeHtml(name)}</strong> &lt;${escapeHtml(request.email)}&gt; dorește să creeze un cont SPVDirect.</p>
<p><a href="${escapeHtml(approveUrl)}">Aprobă contul</a></p>
<p><a href="${escapeHtml(rejectUrl)}">Respinge cererea</a> (adresa de email va fi blocată pentru înregistrări viitoare)</p>`,
    };
  }
}
