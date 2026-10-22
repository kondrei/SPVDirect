import { ConfigService } from '@nestjs/config';
import { createTransport } from 'nodemailer';
import type { ApiLogsService } from '../../api-logs/api-logs.service.js';
import { MailKind } from '../dto/common.enums.js';
import {
  MailService,
  smtpCode,
  smtpErrorCode,
  type MailLogTarget,
} from './mail.service.js';

vi.mock('nodemailer', () => ({ createTransport: vi.fn() }));

const sendMail = vi.fn().mockResolvedValue({});
const record = vi.fn().mockResolvedValue(undefined);

const TARGET: MailLogTarget = {
  kind: MailKind.Invoice,
  accountantId: 1,
  companyId: 7,
};

const MESSAGE = {
  to: 'a@example.com',
  subject: 's',
  text: 't',
  html: 'h',
};

function setup(extra: Record<string, unknown> = {}) {
  vi.mocked(createTransport).mockReturnValue({ sendMail } as never);
  return new MailService(
    new ConfigService({
      MAIL_FROM: 'SPVDirect <no-reply@example.com>',
      SMTP_HOST: 'smtp.example.com',
      SMTP_PORT: 587,
      SMTP_SECURE: false,
      ...extra,
    }),
    { record } as unknown as ApiLogsService,
  );
}

describe('MailService', () => {
  beforeEach(() => vi.clearAllMocks());

  it('builds an SMTP transport with credentials when SMTP_USER is set', () => {
    setup({ SMTP_USER: 'u', SMTP_PASS: 'p' });
    expect(createTransport).toHaveBeenCalledWith({
      host: 'smtp.example.com',
      port: 587,
      secure: false,
      auth: { user: 'u', pass: 'p' },
    });
  });

  it('skips SMTP auth when SMTP_USER is empty', () => {
    setup({ SMTP_USER: '', SMTP_PASS: '' });
    expect(vi.mocked(createTransport).mock.calls[0][0]).toMatchObject({
      auth: undefined,
    });
  });

  it('sends from MAIL_FROM', async () => {
    const mail = setup();
    await mail.send(MESSAGE, TARGET);
    expect(sendMail).toHaveBeenCalledWith({
      from: 'SPVDirect <no-reply@example.com>',
      ...MESSAGE,
    });
  });

  it('returns the SMTP reply code of the accepted message', async () => {
    sendMail.mockResolvedValueOnce({ response: '250 2.0.0 OK 1727 - gsmtp' });
    const mail = setup();
    await expect(mail.send(MESSAGE, TARGET)).resolves.toBe(250);
  });

  it('logs every email in api_logs with recipient, subject and attachment names', async () => {
    sendMail.mockResolvedValueOnce({ response: '250 OK' });
    const mail = setup();
    await mail.send(
      {
        ...MESSAGE,
        replyTo: 'office@example.com',
        attachments: [
          {
            filename: 'factura.pdf',
            content: Buffer.from('%PDF'),
            contentType: 'application/pdf',
          },
        ],
      },
      TARGET,
    );
    expect(record).toHaveBeenCalledWith({
      accountantId: 1,
      anafConnectionId: null,
      companyId: 7,
      service: 'SMTP',
      method: 'SEND',
      endpoint: 'invoice',
      details: {
        to: 'a@example.com',
        subject: 's',
        replyTo: 'office@example.com',
        attachments: ['factura.pdf'],
      },
      statusCode: 250,
      error: null,
      responseTimeMs: expect.any(Number),
    });
  });

  it('never logs the body, which can carry approval links', async () => {
    const mail = setup();
    await mail.send(
      {
        ...MESSAGE,
        text: 'https://api.example.com/auth/registrations/secret-token/approve',
        html: '<a href="secret-token">x</a>',
      },
      { kind: MailKind.AdminApproval, accountantId: 3, companyId: null },
    );
    expect(JSON.stringify(record.mock.calls)).not.toContain('secret-token');
  });

  it('logs a failed send with the SMTP code and rethrows', async () => {
    sendMail.mockRejectedValueOnce(
      Object.assign(new Error('530 Authentication Required'), {
        responseCode: 530,
      }),
    );
    const mail = setup();
    await expect(mail.send(MESSAGE, TARGET)).rejects.toThrow(
      '530 Authentication Required',
    );
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({
        endpoint: 'invoice',
        statusCode: 530,
        error: '530 Authentication Required',
      }),
    );
  });

  it('logs a connection failure without an SMTP code', async () => {
    sendMail.mockRejectedValueOnce(new Error('connect ECONNREFUSED'));
    const mail = setup();
    await expect(mail.send(MESSAGE, TARGET)).rejects.toThrow();
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: null,
        error: 'connect ECONNREFUSED',
      }),
    );
  });
});

describe('SMTP codes', () => {
  it('reads the code from a reply line', () => {
    expect(smtpCode('250 2.0.0 OK')).toBe(250);
    expect(smtpCode(undefined)).toBeNull();
    expect(smtpCode('queued')).toBeNull();
  });

  it('reads responseCode from a nodemailer error', () => {
    expect(
      smtpErrorCode(Object.assign(new Error('auth'), { responseCode: 530 })),
    ).toBe(530);
    expect(smtpErrorCode(new Error('ECONNREFUSED'))).toBeNull();
    expect(smtpErrorCode(null)).toBeNull();
  });
});
