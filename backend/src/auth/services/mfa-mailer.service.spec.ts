import { MailKind } from '../../common/dto/common.enums.js';
import type { MailService } from '../../common/mail/mail.service.js';
import { MFA_MAIL } from '../dto/auth.constants.js';
import { MfaEvent } from '../dto/auth.enums.js';
import { MfaMailer } from './mfa-mailer.service.js';

describe('MfaMailer', () => {
  it('emails the accountant about every MFA event', async () => {
    const send = vi.fn().mockResolvedValue(250);
    const mailer = new MfaMailer({ send } as unknown as MailService);
    for (const event of Object.values(MfaEvent)) {
      await mailer.notify(7, 'ana@example.ro', event);
    }
    expect(send).toHaveBeenCalledTimes(Object.values(MfaEvent).length);
    const index = Object.values(MfaEvent).indexOf(MfaEvent.RecoveryUsed);
    const [message, target] = send.mock.calls[index] as [
      { to: string; subject: string; text: string },
      unknown,
    ];
    expect(message.to).toBe('ana@example.ro');
    expect(message.subject).toBe(MFA_MAIL[MfaEvent.RecoveryUsed].subject);
    expect(message.text).toContain('schimbați imediat parola');
    expect(target).toEqual({
      kind: MailKind.MfaChanged,
      accountantId: 7,
      companyId: null,
    });
  });

  it('emails the code without putting it in the subject', async () => {
    const send = vi.fn().mockResolvedValue(250);
    const mailer = new MfaMailer({ send } as unknown as MailService);
    await mailer.sendCode(7, 'ana@example.ro', '424242');
    const [message, target] = send.mock.calls[0] as [
      { to: string; subject: string; text: string; html: string },
      unknown,
    ];
    expect(message.to).toBe('ana@example.ro');
    expect(message.subject).not.toContain('424242');
    expect(message.text).toContain('424242');
    expect(message.html).toContain('424242');
    expect(target).toEqual({
      kind: MailKind.MfaCode,
      accountantId: 7,
      companyId: null,
    });
  });

  it('lets the caller handle a failed code email', async () => {
    const send = vi.fn().mockRejectedValue(new Error('SMTP down'));
    const mailer = new MfaMailer({ send } as unknown as MailService);
    await expect(
      mailer.sendCode(7, 'ana@example.ro', '424242'),
    ).rejects.toThrow('SMTP down');
  });

  it('never fails the MFA change when the email fails', async () => {
    const send = vi.fn().mockRejectedValue(new Error('SMTP down'));
    const mailer = new MfaMailer({ send } as unknown as MailService);
    await expect(
      mailer.notify(7, 'ana@example.ro', MfaEvent.Disabled),
    ).resolves.toBeUndefined();
  });
});
