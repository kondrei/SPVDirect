import { ConfigService } from '@nestjs/config';
import { createTransport } from 'nodemailer';
import { MailService, smtpCode, smtpErrorCode } from './mail.service.js';

vi.mock('nodemailer', () => ({ createTransport: vi.fn() }));

const sendMail = vi.fn().mockResolvedValue({});

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
    await mail.send({
      to: 'a@example.com',
      subject: 's',
      text: 't',
      html: 'h',
    });
    expect(sendMail).toHaveBeenCalledWith({
      from: 'SPVDirect <no-reply@example.com>',
      to: 'a@example.com',
      subject: 's',
      text: 't',
      html: 'h',
    });
  });

  it('returns the SMTP reply code of the accepted message', async () => {
    sendMail.mockResolvedValueOnce({ response: '250 2.0.0 OK 1727 - gsmtp' });
    const mail = setup();
    await expect(
      mail.send({ to: 'a@example.com', subject: 's', text: 't', html: 'h' }),
    ).resolves.toBe(250);
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
