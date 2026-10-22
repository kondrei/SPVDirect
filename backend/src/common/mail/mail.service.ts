import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, type Transporter } from 'nodemailer';
import { ApiLogsService } from '../../api-logs/api-logs.service.js';
import {
  ApiLogMethod,
  ApiLogService,
} from '../../api-logs/dto/api-log.enums.js';
import type { ActivityDetails } from '../../api-logs/dto/api-log.types.js';
import { trackApiCall } from '../../api-logs/track-api-call.js';
import type { Env } from '../../config/env.validation.js';
import type { MailKind } from '../dto/common.enums.js';

export interface MailAttachment {
  filename: string;
  content: Buffer;
  contentType: string;
}

export interface MailMessage {
  to: string;
  replyTo?: string;
  subject: string;
  text: string;
  html: string;
  attachments?: MailAttachment[];
}

export interface MailLogTarget {
  kind: MailKind;
  accountantId: number | null;
  companyId: number | null;
}

@Injectable()
export class MailService {
  private readonly transporter: Transporter;
  private readonly from: string;

  constructor(
    config: ConfigService<Env, true>,
    private readonly apiLogs: ApiLogsService,
  ) {
    const user = config.get('SMTP_USER', { infer: true });
    const pass = config.get('SMTP_PASS', { infer: true });
    this.from = config.get('MAIL_FROM', { infer: true });
    this.transporter = createTransport({
      host: config.get('SMTP_HOST', { infer: true }),
      port: config.get('SMTP_PORT', { infer: true }),
      secure: config.get('SMTP_SECURE', { infer: true }),
      auth: user ? { user, pass } : undefined,
    });
  }

  send(message: MailMessage, target: MailLogTarget): Promise<number | null> {
    return trackApiCall(
      this.apiLogs,
      {
        accountantId: target.accountantId,
        anafConnectionId: null,
        companyId: target.companyId,
        service: ApiLogService.Smtp,
        method: ApiLogMethod.Send,
        endpoint: target.kind,
        details: mailDetails(message),
      },
      async (outcome) => {
        try {
          const info = (await this.transporter.sendMail({
            from: this.from,
            ...message,
          })) as { response?: unknown } | undefined;
          outcome.statusCode = smtpCode(info?.response);
          return outcome.statusCode;
        } catch (err) {
          outcome.statusCode = smtpErrorCode(err);
          outcome.error = (err as Error).message;
          throw err;
        }
      },
    );
  }
}

export function mailDetails(message: MailMessage): ActivityDetails {
  return {
    to: message.to,
    subject: message.subject,
    replyTo: message.replyTo ?? null,
    attachments: (message.attachments ?? []).map((a) => a.filename),
  };
}

export function smtpCode(response: unknown): number | null {
  if (typeof response !== 'string') return null;
  const match = /^(\d{3})\b/.exec(response);
  return match ? Number(match[1]) : null;
}

export function smtpErrorCode(err: unknown): number | null {
  const code = (err as { responseCode?: unknown } | null)?.responseCode;
  return typeof code === 'number' ? code : null;
}
