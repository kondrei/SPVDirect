import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import type { MailService } from '../../common/mail/mail.service.js';
import { line, sampleInvoice } from '../../testing/invoice-fixtures.js';
import { CreateStornoDto } from '../dto/invoice.dto.js';
import { computeInvoice } from './invoice-calc.js';
import { stornoReference } from './invoice-format.js';
import { InvoiceMailer } from '../services/invoice-mailer.service.js';
import { renderInvoicePdf } from '../builders/invoice-pdf.js';
import { renderInvoiceXml } from '../builders/invoice-xml.js';
import type { Invoice } from '../invoice.entity.js';

function storno(): Invoice {
  const computed = computeInvoice(
    [
      { ...line({ unitPrice: 100 }), quantity: -1, stornoOfLine: 0 },
      {
        ...line({ unitPrice: 50, vatRate: 11 }),
        quantity: -1,
        stornoOfLine: 1,
      },
    ],
    null,
  );
  return sampleInvoice({
    id: 2,
    number: 13,
    issueDate: '2026-10-10',
    deliveryDate: '2026-10-10',
    dueDate: null,
    lines: computed.lines,
    vatBreakdown: computed.totals.breakdown,
    totalNet: computed.totals.net,
    totalVat: computed.totals.vat,
    totalGross: computed.totals.gross,
    stornoOfInvoiceId: 1,
    stornoOfSeries: 'FCT',
    stornoOfNumber: 12,
    stornoOfIssueDate: '2026-10-04',
  });
}

describe('computeInvoice with negative quantities', () => {
  it('rounds VAT half away from zero so a storno mirrors the original', () => {
    const lines = [line({ unitPrice: 0.5, quantity: 1, vatRate: 21 })];
    const positive = computeInvoice(lines, null);
    const negative = computeInvoice(
      lines.map((l) => ({ ...l, quantity: -l.quantity })),
      null,
    );
    expect(positive.totals.vat).toBe(0.11);
    expect(negative.totals.vat).toBe(-0.11);
    expect(negative.totals.gross).toBe(-positive.totals.gross);
  });

  it('keeps the line reference to the reversed line', () => {
    const { lines } = computeInvoice(
      [{ ...line(), quantity: -2, stornoOfLine: 3 }],
      null,
    );
    expect(lines[0]).toMatchObject({ netAmount: -200, stornoOfLine: 3 });
  });
});

describe('stornoReference', () => {
  it('names the reversed invoice', () => {
    expect(stornoReference(storno())).toBe('FCT nr. 000012 din 04.10.2026');
  });

  it('is null for a normal invoice', () => {
    expect(stornoReference(sampleInvoice())).toBeNull();
  });
});

describe('storno PDF', () => {
  it('renders a storno invoice', async () => {
    const pdf = await renderInvoicePdf(storno(), null);
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
  });
});

describe('storno XML', () => {
  const xml = renderInvoiceXml(storno());

  it('references the reversed invoice before the parties', () => {
    expect(xml).toContain(
      '<cac:BillingReference><cac:InvoiceDocumentReference><cbc:ID>FCT000012</cbc:ID><cbc:IssueDate>2026-10-04</cbc:IssueDate></cac:InvoiceDocumentReference></cac:BillingReference>',
    );
    expect(xml.indexOf('<cac:BillingReference>')).toBeLessThan(
      xml.indexOf('<cac:AccountingSupplierParty>'),
    );
  });

  it('carries negative quantities and totals', () => {
    expect(xml).toContain('unitCode="C62">-1</cbc:InvoicedQuantity>');
    expect(xml).toContain('currencyID="RON">-150.00</cbc:TaxExclusiveAmount>');
    expect(xml).toContain('currencyID="RON">-176.50</cbc:PayableAmount>');
  });

  it('notes what it reverses', () => {
    expect(xml).toContain('Stornare factură FCT nr. 000012 din 04.10.2026');
  });

  it('has no billing reference on a normal invoice', () => {
    expect(renderInvoiceXml(sampleInvoice())).not.toContain('BillingReference');
  });
});

describe('storno email', () => {
  it('says it is a storno invoice', () => {
    const mailer = new InvoiceMailer({} as MailService);
    const message = mailer.message(storno(), 'a@b.ro', Buffer.alloc(0));
    expect(message.subject).toBe(
      'Factura de stornare FCT 000013 de la AGRO VEST SRL',
    );
    expect(message.text).toContain('factura de stornare FCT 000013');
  });
});

describe('CreateStornoDto', () => {
  async function check(body: Record<string, unknown>) {
    const dto = plainToInstance(CreateStornoDto, body);
    const errors = await validate(dto, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });
    const messages: string[] = [];
    const walk = (list: typeof errors) => {
      for (const e of list) {
        messages.push(...Object.values(e.constraints ?? {}));
        walk(e.children ?? []);
      }
    };
    walk(errors);
    return { dto, messages };
  }

  it('accepts an empty body: reverse everything today', async () => {
    expect((await check({})).messages).toEqual([]);
  });

  it('normalizes the series and blank values', async () => {
    const { dto, messages } = await check({
      series: ' str ',
      issueDate: '',
      notes: '  ',
      sendToEmail: '',
    });
    expect(messages).toEqual([]);
    expect(dto.series).toBe('STR');
    expect(dto.issueDate).toBeNull();
    expect(dto.notes).toBeNull();
    expect(dto.sendToEmail).toBeNull();
  });

  it('accepts partial lines', async () => {
    const { messages } = await check({
      lines: [{ lineIndex: 0, quantity: 1.5 }],
    });
    expect(messages).toEqual([]);
  });

  it('rejects a non positive quantity, a negative index and a bad date', async () => {
    const { messages } = await check({
      issueDate: '10.10.2026',
      lines: [{ lineIndex: -1, quantity: 0 }],
    });
    expect(messages).toEqual(
      expect.arrayContaining([
        'Data trebuie să fie în formatul AAAA-LL-ZZ',
        'Cantitatea de stornat trebuie să fie pozitivă',
      ]),
    );
    expect(messages.length).toBeGreaterThanOrEqual(3);
  });
});
