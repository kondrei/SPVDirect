import type { ApiLogsService } from '../../api-logs/api-logs.service.js';
import type { MailService } from '../../common/mail/mail.service.js';
import { party, sampleInvoice } from '../../testing/invoice-fixtures.js';
import { InvoiceMailer } from './invoice-mailer.service.js';

function setup() {
  const mail = { send: vi.fn().mockResolvedValue(250) };
  const apiLogs = { record: vi.fn().mockResolvedValue(undefined) };
  const mailer = new InvoiceMailer(
    mail as unknown as MailService,
    apiLogs as unknown as ApiLogsService,
  );
  return { mailer, mail, apiLogs };
}

describe('InvoiceMailer', () => {
  it('attaches the PDF and replies to the seller', async () => {
    const { mailer, mail } = setup();
    const pdf = Buffer.from('%PDF-test');
    await mailer.send(sampleInvoice(), 'client@exemplu.ro', pdf);
    const message = mail.send.mock.calls[0][0];
    expect(message).toMatchObject({
      to: 'client@exemplu.ro',
      replyTo: 'office@agrovest.ro',
      subject: 'Factura FCT 000012 de la AGRO VEST SRL',
    });
    expect(message.attachments).toEqual([
      {
        filename: 'factura-FCT-000012.pdf',
        content: pdf,
        contentType: 'application/pdf',
      },
    ]);
    expect(message.text).toContain('176,50 RON');
    expect(message.text).toContain('Scadența este 30.10.2026');
  });

  it('escapes the seller name in the HTML body', () => {
    const { mailer } = setup();
    const message = mailer.message(
      sampleInvoice({ seller: party({ name: 'A <b>&</b> B' }) }),
      'a@b.ro',
      Buffer.alloc(0),
    );
    expect(message.html).toContain('A &lt;b&gt;&amp;&lt;/b&gt; B');
    expect(message.html).not.toContain('<b>&</b>');
  });

  it('omits reply-to when the seller has no email', () => {
    const { mailer } = setup();
    const message = mailer.message(
      sampleInvoice({ seller: party({ email: null }) }),
      'a@b.ro',
      Buffer.alloc(0),
    );
    expect(message.replyTo).toBeUndefined();
  });

  it('writes the attempt to api_logs with the SMTP code', async () => {
    const { mailer, apiLogs } = setup();
    await mailer.send(sampleInvoice(), 'a@b.ro', Buffer.alloc(0));
    expect(apiLogs.record).toHaveBeenCalledWith(
      expect.objectContaining({
        accountantId: 1,
        companyId: 7,
        service: 'SMTP',
        method: 'SEND',
        endpoint: 'invoice',
        statusCode: 250,
        error: null,
      }),
    );
  });

  it('logs a failed attempt and rethrows', async () => {
    const { mailer, mail, apiLogs } = setup();
    mail.send.mockRejectedValue(
      Object.assign(new Error('mailbox unavailable'), { responseCode: 550 }),
    );
    await expect(
      mailer.send(sampleInvoice(), 'a@b.ro', Buffer.alloc(0)),
    ).rejects.toThrow('mailbox unavailable');
    expect(apiLogs.record).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 550,
        error: 'mailbox unavailable',
      }),
    );
  });
});
