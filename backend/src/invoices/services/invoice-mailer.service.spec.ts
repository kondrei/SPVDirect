import { MailKind } from '../../common/dto/common.enums.js';
import type { MailService } from '../../common/mail/mail.service.js';
import { party, sampleInvoice } from '../../testing/invoice-fixtures.js';
import { InvoiceMailer } from './invoice-mailer.service.js';

function setup() {
  const mail = { send: vi.fn().mockResolvedValue(250) };
  const mailer = new InvoiceMailer(mail as unknown as MailService);
  return { mailer, mail };
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

  it('sends it as an invoice mail for the company, so MailService logs it', async () => {
    const { mailer, mail } = setup();
    await mailer.send(sampleInvoice(), 'a@b.ro', Buffer.alloc(0));
    expect(mail.send.mock.calls[0][1]).toEqual({
      kind: MailKind.Invoice,
      accountantId: 1,
      companyId: 7,
    });
  });

  it('rethrows a failed send', async () => {
    const { mailer, mail } = setup();
    mail.send.mockRejectedValue(new Error('mailbox unavailable'));
    await expect(
      mailer.send(sampleInvoice(), 'a@b.ro', Buffer.alloc(0)),
    ).rejects.toThrow('mailbox unavailable');
  });
});
