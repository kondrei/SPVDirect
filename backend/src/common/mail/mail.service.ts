import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, type Transporter } from 'nodemailer';
import type { Env } from '../../config/env.validation.js';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

@Injectable()
export class MailService {
  private readonly transporter: Transporter;
  private readonly from: string;

  constructor(config: ConfigService<Env, true>) {
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

  async send(message: MailMessage): Promise<number | null> {
    const info = (await this.transporter.sendMail({
      from: this.from,
      ...message,
    })) as { response?: unknown } | undefined;
    return smtpCode(info?.response);
  }
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
