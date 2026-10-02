import { ConfigService } from '@nestjs/config';
import type { Repository } from 'typeorm';
import type { Accountant } from '../../accountants/accountant.entity.js';
import type { ApiLogsService } from '../../api-logs/api-logs.service.js';
import type { MailService } from '../../common/mail/mail.service.js';
import { RegistrationMailer } from './registration-mailer.service.js';

const request = {
  accountantId: 7,
  email: 'new@example.com',
  name: 'Ana <Pop>',
  approvalToken: 'tok',
};

function setup() {
  const send = vi.fn().mockResolvedValue(250);
  const record = vi.fn().mockResolvedValue(undefined);
  const update = vi.fn().mockResolvedValue({ affected: 1 });
  const mailer = new RegistrationMailer(
    new ConfigService({
      API_URL: 'https://api.example.com',
      FRONTEND_URL: 'https://app.example.com',
      ADMIN_EMAIL: 'admin@example.com',
    }),
    { send } as unknown as MailService,
    { record } as unknown as ApiLogsService,
    { update } as unknown as Repository<Accountant>,
  );
  return { mailer, send, record, update };
}

const smtpAuthError = Object.assign(
  new Error('Mail command failed: 530-5.7.0 Authentication Required.'),
  { responseCode: 530 },
);

describe('RegistrationMailer.notifyAdmin', () => {
  it('emails the admin approve and reject links for the token', async () => {
    const { mailer, send } = setup();
    await expect(mailer.notifyAdmin(request)).resolves.toBe(true);
    const mail = send.mock.calls[0][0] as {
      to: string;
      subject: string;
      text: string;
      html: string;
    };
    expect(mail.to).toBe('admin@example.com');
    expect(mail.subject).toContain('new@example.com');
    expect(mail.text).toContain(
      'https://api.example.com/auth/registrations/tok/approve',
    );
    expect(mail.text).toContain(
      'https://api.example.com/auth/registrations/tok/reject',
    );
    expect(mail.html).toContain('Ana &lt;Pop&gt;');
    expect(mail.html).not.toContain('<Pop>');
  });

  it('marks the request as notified and logs the send in api_logs', async () => {
    const { mailer, update, record } = setup();
    await mailer.notifyAdmin(request);
    expect(update).toHaveBeenCalledWith(
      { id: 7 },
      { adminNotifiedAt: expect.any(Date) },
    );
    expect(record).toHaveBeenCalledWith({
      accountantId: 7,
      anafConnectionId: null,
      companyId: null,
      service: 'SMTP',
      method: 'SEND',
      endpoint: 'admin-approval',
      statusCode: 250,
      responseTimeMs: expect.any(Number),
      error: null,
    });
  });

  it('logs a failed send with the SMTP code and leaves the request unnotified', async () => {
    const { mailer, send, update, record } = setup();
    send.mockRejectedValue(smtpAuthError);
    await expect(mailer.notifyAdmin(request)).resolves.toBe(false);
    expect(update).not.toHaveBeenCalled();
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({
        accountantId: 7,
        endpoint: 'admin-approval',
        statusCode: 530,
        error: smtpAuthError.message,
      }),
    );
  });

  it('never writes the approval token into api_logs', async () => {
    const { mailer, send, record } = setup();
    send.mockRejectedValue(smtpAuthError);
    await mailer.notifyAdmin({ ...request, approvalToken: 'secret-token' });
    expect(JSON.stringify(record.mock.calls)).not.toContain('secret-token');
  });

  it('still reports the email as sent when marking it fails', async () => {
    const { mailer, update } = setup();
    update.mockRejectedValue(new Error('connection lost'));
    await expect(mailer.notifyAdmin(request)).resolves.toBe(true);
  });
});

describe('RegistrationMailer.notifyApproved', () => {
  it('sends the login link and logs it as approval-notice', async () => {
    const { mailer, send, record } = setup();
    await expect(mailer.notifyApproved(7, 'new@example.com')).resolves.toBe(
      true,
    );
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'new@example.com',
        text: expect.stringContaining('https://app.example.com/login'),
      }),
    );
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({ endpoint: 'approval-notice', statusCode: 250 }),
    );
  });

  it('logs a connection failure without an SMTP code', async () => {
    const { mailer, send, record } = setup();
    send.mockRejectedValue(new Error('connect ECONNREFUSED'));
    await expect(mailer.notifyApproved(7, 'new@example.com')).resolves.toBe(
      false,
    );
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: null,
        error: 'connect ECONNREFUSED',
      }),
    );
  });
});
