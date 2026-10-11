import { deflateSync } from 'node:zlib';
import { computeInvoice } from '../helpers/invoice-calc.js';
import { line, sampleInvoice } from '../../testing/invoice-fixtures.js';
import { renderInvoicePdf } from './invoice-pdf.js';

function tinyPng(): Buffer {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf: Buffer) => {
    let c = 0xffffffff;
    for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type), data]);
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const sum = Buffer.alloc(4);
    sum.writeUInt32BE(crc(body));
    return Buffer.concat([length, body, sum]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(1, 0);
  header.writeUInt32BE(1, 4);
  header[8] = 8;
  header[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(Buffer.from([0, 255, 0, 0]))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function pageCount(pdf: Buffer): number {
  return (pdf.toString('latin1').match(/\/Type \/Page\b/g) ?? []).length;
}

describe('renderInvoicePdf', () => {
  it('produces a PDF document', async () => {
    const pdf = await renderInvoicePdf(sampleInvoice(), null);
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.length).toBeGreaterThan(2_000);
    expect(pageCount(pdf)).toBe(1);
  });

  it('embeds the company logo', async () => {
    const without = await renderInvoicePdf(sampleInvoice(), null);
    const withLogo = await renderInvoicePdf(sampleInvoice(), {
      content: tinyPng(),
      contentType: 'image/png',
    });
    expect(withLogo.toString('latin1')).toContain('/Subtype /Image');
    expect(without.toString('latin1')).not.toContain('/Subtype /Image');
  });

  it('ignores a logo that cannot be decoded', async () => {
    const pdf = await renderInvoicePdf(sampleInvoice(), {
      content: Buffer.from('not an image'),
      contentType: 'image/png',
    });
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('continues on a new page when there are many lines', async () => {
    const computed = computeInvoice(
      Array.from({ length: 60 }, (_, i) =>
        line({
          description: `Serviciu numărul ${i + 1} cu denumire lungă`.repeat(2),
        }),
      ),
      null,
    );
    const pdf = await renderInvoicePdf(
      sampleInvoice({
        lines: computed.lines,
        vatBreakdown: computed.totals.breakdown,
        totalNet: computed.totals.net,
        totalVat: computed.totals.vat,
        totalGross: computed.totals.gross,
      }),
      null,
    );
    expect(pageCount(pdf)).toBeGreaterThan(1);
  });

  it('renders a foreign currency invoice, exemptions and VAT on collection', async () => {
    const computed = computeInvoice(
      [
        line({
          vatRate: 0,
          vatCategory: 'AE',
          vatExemptionReason: 'Taxare inversă',
        }),
      ],
      4.9765,
    );
    const pdf = await renderInvoicePdf(
      sampleInvoice({
        currency: 'EUR',
        exchangeRate: 4.9765,
        vatOnCollection: true,
        notes: 'Mulțumim pentru colaborare',
        lines: computed.lines,
        vatBreakdown: computed.totals.breakdown,
        totalNet: computed.totals.net,
        totalVat: computed.totals.vat,
        totalGross: computed.totals.gross,
        totalVatRon: computed.totals.vatRon,
      }),
      null,
    );
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('renders an invoice from a seller that is not a VAT payer', async () => {
    const base = sampleInvoice();
    const pdf = await renderInvoicePdf(
      sampleInvoice({ seller: { ...base.seller, vatPayer: false } }),
      null,
    );
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
  });
});
