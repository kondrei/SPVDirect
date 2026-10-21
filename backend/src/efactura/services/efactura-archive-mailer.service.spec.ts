import type { ApiLogsService } from '../../api-logs/api-logs.service.js';
import type { MailService } from '../../common/mail/mail.service.js';
import { EfacturaDirection } from '../dto/efactura.enums.js';
import type { EfacturaInvoice } from '../efactura-invoice.entity.js';
import { EfacturaArchiveMailer } from './efactura-archive-mailer.service.js';

const INVOICE = {
  id: 31,
  accountantId: 1,
  companyId: 7,
  anafMessageId: '3001',
  direction: EfacturaDirection.Received,
  number: 'FCT-0042',
  issueDate: '2026-10-02',
  supplierName: 'ALFA <b>SRL</b>\nX',
  customerName: 'BETA SRL',
  totalGross: 1210.5,
  currency: 'RON',
} as EfacturaInvoice;

const ATTACHMENTS = [
  {
    filename: 'factura-FCT-0042-3001.zip',
    content: Buffer.from('PK'),
    contentType: 'application/zip',
  },
];

function setup() {
  const mail = { send: vi.fn().mockResolvedValue(250) };
  const apiLogs = { record: vi.fn().mockResolvedValue(undefined) };
  const mailer = new EfacturaArchiveMailer(
    mail as unknown as MailService,
    apiLogs as unknown as ApiLogsService,
  );
  return { mailer, mail, apiLogs };
}

describe('EfacturaArchiveMailer', () => {
  it('describes the invoice, adds the note and escapes the HTML', () => {
    const { mailer } = setup();
    const message = mailer.message(
      INVOICE,
      'client@example.com',
      'Rândul 1\n<script>',
      ATTACHMENTS,
    );
    expect(message.to).toBe('client@example.com');
    expect(message.subject).toBe('Factura FCT-0042 de la ALFA <b>SRL</b> X');
    expect(message.text).toContain('Rândul 1\n<script>');
    expect(message.text).toContain('factura FCT-0042, din 2026-10-02');
    expect(message.text).toContain('1.210,50 RON');
    expect(message.html).toContain('Rândul 1<br>&lt;script&gt;');
    expect(message.html).not.toContain('<b>SRL');
    expect(message.attachments).toBe(ATTACHMENTS);
  });

  it('writes the attempt to api_logs with the SMTP code', async () => {
    const { mailer, apiLogs } = setup();
    await mailer.send(INVOICE, 'client@example.com', undefined, ATTACHMENTS);
    expect(apiLogs.record).toHaveBeenCalledWith(
      expect.objectContaining({
        accountantId: 1,
        companyId: 7,
        service: 'SMTP',
        method: 'SEND',
        endpoint: 'efactura-archive',
        statusCode: 250,
      }),
    );
  });

  it('logs a failed attempt and rethrows', async () => {
    const { mailer, mail, apiLogs } = setup();
    mail.send.mockRejectedValue(
      Object.assign(new Error('rejected'), { responseCode: 550 }),
    );
    await expect(
      mailer.send(INVOICE, 'client@example.com', undefined, ATTACHMENTS),
    ).rejects.toThrow('rejected');
    expect(apiLogs.record).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 550, error: 'rejected' }),
    );
  });
});
