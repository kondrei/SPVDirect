import { ConfigService } from '@nestjs/config';
import type { Repository } from 'typeorm';
import type { Accountant } from '../../../accountants/accountant.entity.js';
import { MailKind } from '../../../common/dto/common.enums.js';
import type { MailService } from '../../../common/mail/mail.service.js';
import { RegistrationMailer } from './registration-mailer.service.js';
import { AccountantRepository } from '../../../accountants/repositories/accountant.repository.js';

const request = {
  accountantId: 7,
  email: 'new@example.com',
  name: 'Ana <Pop>',
  approvalToken: 'tok',
};

function setup() {
  const send = vi.fn().mockResolvedValue(250);
  const update = vi.fn().mockResolvedValue({ affected: 1 });
  const mailer = new RegistrationMailer(
    new ConfigService({
      API_URL: 'https://api.example.com',
      FRONTEND_URL: 'https://app.example.com',
      ADMIN_EMAIL: 'admin@example.com',
    }),
    { send } as unknown as MailService,
    new AccountantRepository({ update } as unknown as Repository<Accountant>),
  );
  return { mailer, send, update };
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

  it('marks the request as notified and sends it as an admin-approval mail', async () => {
    const { mailer, send, update } = setup();
    await mailer.notifyAdmin(request);
    expect(update).toHaveBeenCalledWith(
      { id: 7 },
      { adminNotifiedAt: expect.any(Date) },
    );
    expect(send.mock.calls[0][1]).toEqual({
      kind: MailKind.AdminApproval,
      accountantId: 7,
      companyId: null,
    });
  });

  it('leaves the request unnotified when the send fails', async () => {
    const { mailer, send, update } = setup();
    send.mockRejectedValue(smtpAuthError);
    await expect(mailer.notifyAdmin(request)).resolves.toBe(false);
    expect(update).not.toHaveBeenCalled();
  });

  it('keeps the approval token out of the subject, which goes into api_logs', async () => {
    const { mailer, send } = setup();
    await mailer.notifyAdmin({ ...request, approvalToken: 'secret-token' });
    const mail = send.mock.calls[0][0] as { subject: string };
    expect(mail.subject).not.toContain('secret-token');
  });

  it('still reports the email as sent when marking it fails', async () => {
    const { mailer, update } = setup();
    update.mockRejectedValue(new Error('connection lost'));
    await expect(mailer.notifyAdmin(request)).resolves.toBe(true);
  });
});

describe('RegistrationMailer.notifyApproved', () => {
  it('sends the login link as an approval-notice mail', async () => {
    const { mailer, send } = setup();
    await expect(mailer.notifyApproved(7, 'new@example.com')).resolves.toBe(
      true,
    );
    expect(send.mock.calls[0][0]).toMatchObject({
      to: 'new@example.com',
      text: expect.stringContaining('https://app.example.com/login'),
    });
    expect(send.mock.calls[0][1]).toEqual({
      kind: MailKind.ApprovalNotice,
      accountantId: 7,
      companyId: null,
    });
  });

  it('reports a failed send as false', async () => {
    const { mailer, send } = setup();
    send.mockRejectedValue(new Error('connect ECONNREFUSED'));
    await expect(mailer.notifyApproved(7, 'new@example.com')).resolves.toBe(
      false,
    );
  });
});
