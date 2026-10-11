import { createRequire } from 'node:module';
import path from 'node:path';
import PDFDocument from 'pdfkit';
import type { Invoice } from '../invoice.entity.js';
import {
  formatAmount,
  formatIsoDate,
  formatQuantity,
  invoiceNumber,
  stornoReference,
  vatId,
} from '../helpers/invoice-format.js';
import type { InvoiceParty, PaymentMethod } from '../invoice.types.js';

export interface InvoiceLogo {
  content: Buffer;
  contentType: string;
}

type InvoiceData = Pick<
  Invoice,
  | 'series'
  | 'number'
  | 'issueDate'
  | 'deliveryDate'
  | 'dueDate'
  | 'currency'
  | 'exchangeRate'
  | 'paymentMethod'
  | 'vatOnCollection'
  | 'seller'
  | 'buyer'
  | 'lines'
  | 'vatBreakdown'
  | 'totalNet'
  | 'totalVat'
  | 'totalGross'
  | 'totalVatRon'
  | 'stornoOfSeries'
  | 'stornoOfNumber'
  | 'stornoOfIssueDate'
  | 'notes'
>;

const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  transfer: 'Transfer bancar',
  numerar: 'Numerar',
  card: 'Card',
};

const MARGIN = 40;
const WIDTH = 515;
const PAGE_BOTTOM = 770;
const REGULAR = 'regular';
const BOLD = 'bold';
const INK = '#1a1a1a';
const MUTED = '#5b6270';
const RULE = '#c9cdd3';
const HEAD_FILL = '#eceef1';

const COLUMNS = [
  { key: 'nr', title: 'Nr.', width: 24, align: 'left' },
  {
    key: 'description',
    title: 'Denumire produs / serviciu',
    width: 207,
    align: 'left',
  },
  { key: 'unit', title: 'U.M.', width: 40, align: 'left' },
  { key: 'quantity', title: 'Cantitate', width: 55, align: 'right' },
  { key: 'unitPrice', title: 'Preț unitar', width: 70, align: 'right' },
  { key: 'net', title: 'Valoare', width: 70, align: 'right' },
  { key: 'vat', title: 'TVA', width: 49, align: 'right' },
] as const;

function fontPath(file: string): string {
  const require = createRequire(import.meta.url);
  const root = path.dirname(require.resolve('dejavu-fonts-ttf/package.json'));
  return path.join(root, 'ttf', file);
}

function vatLabel(category: string, rate: number): string {
  return category === 'S' || rate > 0 ? `${rate}%` : '0%';
}

export function renderInvoicePdf(
  invoice: InvoiceData,
  logo: InvoiceLogo | null,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const number = invoiceNumber(invoice.series, invoice.number);
    const doc = new PDFDocument({
      size: 'A4',
      margin: MARGIN,
      bufferPages: true,
      info: {
        Title: `Factură ${number}`,
        Author: invoice.seller.name,
        Producer: 'SPVDirect',
      },
    });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.registerFont(REGULAR, fontPath('DejaVuSans.ttf'));
    doc.registerFont(BOLD, fontPath('DejaVuSans-Bold.ttf'));

    const ensureSpace = (height: number) => {
      if (doc.y + height > PAGE_BOTTOM) {
        doc.addPage();
        doc.y = MARGIN;
      }
    };

    drawHeader(doc, invoice, number, logo);
    drawParties(doc, invoice.seller, invoice.buyer);
    drawLines(doc, invoice, ensureSpace);
    drawTotals(doc, invoice, ensureSpace);
    drawMentions(doc, invoice, ensureSpace);
    drawFooter(doc);

    doc.end();
  });
}

function drawHeader(
  doc: PDFKit.PDFDocument,
  invoice: InvoiceData,
  number: string,
  logo: InvoiceLogo | null,
): void {
  const reference = stornoReference(invoice);
  if (logo) {
    try {
      doc.image(logo.content, MARGIN, MARGIN, { fit: [150, 70] });
    } catch {
      doc.fillColor(INK);
    }
  }
  doc
    .font(BOLD)
    .fontSize(reference ? 15 : 20)
    .fillColor(INK)
    .text(reference ? 'FACTURĂ DE STORNARE' : 'FACTURĂ', 300, MARGIN, {
      width: 255,
      align: 'right',
    });
  doc
    .font(BOLD)
    .fontSize(11)
    .text(`Seria ${number.replace(' ', ' nr. ')}`, {
      width: 255,
      align: 'right',
    });
  doc.font(REGULAR).fontSize(9).fillColor(MUTED);
  const dates = [
    `Data emiterii: ${formatIsoDate(invoice.issueDate)}`,
    `Data livrării / prestării: ${formatIsoDate(invoice.deliveryDate)}`,
    invoice.dueDate ? `Scadență: ${formatIsoDate(invoice.dueDate)}` : null,
    `Monedă: ${invoice.currency}`,
    reference ? `Stornează factura ${reference}` : null,
  ];
  for (const line of dates.filter((l): l is string => l !== null)) {
    doc.text(line, 300, doc.y, { width: 255, align: 'right' });
  }
  doc.y = Math.max(doc.y, MARGIN + 80) + 14;
}

function partyLines(party: InvoiceParty): string[] {
  const id = vatId(party);
  return [
    id ? `CUI: ${id}` : '',
    party.regCom ? `Reg. Com.: ${party.regCom}` : '',
    `Adresa: ${party.address}`,
    party.iban ? `IBAN: ${party.iban}` : '',
    party.bank ? `Banca: ${party.bank}` : '',
    party.phone ? `Tel.: ${party.phone}` : '',
    party.email ? `Email: ${party.email}` : '',
  ].filter(Boolean);
}

function drawParties(
  doc: PDFKit.PDFDocument,
  seller: InvoiceParty,
  buyer: InvoiceParty,
): void {
  const top = doc.y;
  const columnWidth = 247;
  const blocks: [number, string, InvoiceParty][] = [
    [MARGIN, 'FURNIZOR', seller],
    [MARGIN + columnWidth + 21, 'CUMPĂRĂTOR', buyer],
  ];
  let bottom = top;
  for (const [x, title, party] of blocks) {
    doc.font(BOLD).fontSize(8).fillColor(MUTED).text(title, x, top, {
      width: columnWidth,
    });
    doc
      .font(BOLD)
      .fontSize(10)
      .fillColor(INK)
      .text(party.name, x, doc.y + 2, {
        width: columnWidth,
      });
    doc.font(REGULAR).fontSize(9);
    for (const line of partyLines(party)) {
      doc.text(line, x, doc.y + 1, { width: columnWidth });
    }
    bottom = Math.max(bottom, doc.y);
  }
  doc.y = bottom + 16;
}

function drawLines(
  doc: PDFKit.PDFDocument,
  invoice: InvoiceData,
  ensureSpace: (height: number) => void,
): void {
  const drawHead = () => {
    const y = doc.y;
    doc.rect(MARGIN, y, WIDTH, 20).fill(HEAD_FILL);
    doc.font(BOLD).fontSize(8).fillColor(INK);
    let x = MARGIN;
    for (const column of COLUMNS) {
      doc.text(column.title, x + 4, y + 6, {
        width: column.width - 8,
        align: column.align,
      });
      x += column.width;
    }
    doc.y = y + 20;
  };

  drawHead();
  invoice.lines.forEach((line, index) => {
    const cells: Record<(typeof COLUMNS)[number]['key'], string> = {
      nr: String(index + 1),
      description: line.description,
      unit: line.unit,
      quantity: formatQuantity(line.quantity),
      unitPrice: formatAmount(line.unitPrice),
      net: formatAmount(line.netAmount),
      vat: vatLabel(line.vatCategory, line.vatRate),
    };
    doc.font(REGULAR).fontSize(9);
    const descriptionWidth = COLUMNS[1].width - 8;
    const height = Math.max(
      doc.heightOfString(cells.description, { width: descriptionWidth }) + 10,
      22,
    );
    if (doc.y + height > PAGE_BOTTOM) {
      doc.addPage();
      doc.y = MARGIN;
      drawHead();
    }
    const y = doc.y;
    let x = MARGIN;
    doc.fillColor(INK);
    for (const column of COLUMNS) {
      doc.text(cells[column.key], x + 4, y + 5, {
        width: column.width - 8,
        align: column.align,
      });
      x += column.width;
    }
    doc
      .moveTo(MARGIN, y + height)
      .lineTo(MARGIN + WIDTH, y + height)
      .strokeColor(RULE)
      .lineWidth(0.5)
      .stroke();
    doc.y = y + height;
  });
  ensureSpace(0);
  doc.y += 14;
}

function drawTotals(
  doc: PDFKit.PDFDocument,
  invoice: InvoiceData,
  ensureSpace: (height: number) => void,
): void {
  const rows = invoice.vatBreakdown.length;
  ensureSpace(40 + rows * 16 + 80);
  const top = doc.y;

  doc
    .font(BOLD)
    .fontSize(8)
    .fillColor(MUTED)
    .text('DEFALCARE TVA', MARGIN, top);
  doc.font(REGULAR).fontSize(9).fillColor(INK);
  let y = top + 14;
  for (const row of invoice.vatBreakdown) {
    doc.text(`Cota ${vatLabel(row.category, row.rate)}`, MARGIN, y, {
      width: 70,
    });
    doc.text(`Bază: ${formatAmount(row.taxableAmount)}`, MARGIN + 70, y, {
      width: 100,
      align: 'right',
    });
    doc.text(`TVA: ${formatAmount(row.vatAmount)}`, MARGIN + 175, y, {
      width: 90,
      align: 'right',
    });
    y += 16;
  }

  const boxX = 330;
  const boxWidth = MARGIN + WIDTH - boxX;
  const line = (label: string, value: string, bold = false, at = top) => {
    doc
      .font(bold ? BOLD : REGULAR)
      .fontSize(bold ? 11 : 9)
      .fillColor(INK);
    doc.text(label, boxX, at, { width: boxWidth - 100 });
    doc.text(value, boxX + boxWidth - 100, at, { width: 100, align: 'right' });
  };
  line('Total fără TVA', formatAmount(invoice.totalNet), false, top);
  line('Total TVA', formatAmount(invoice.totalVat), false, top + 16);
  doc
    .moveTo(boxX, top + 36)
    .lineTo(MARGIN + WIDTH, top + 36)
    .strokeColor(INK)
    .lineWidth(0.8)
    .stroke();
  line(
    `Total de plată (${invoice.currency})`,
    formatAmount(invoice.totalGross),
    true,
    top + 42,
  );
  let totalsBottom = top + 62;
  if (invoice.currency !== 'RON' && invoice.exchangeRate) {
    doc.font(REGULAR).fontSize(8).fillColor(MUTED);
    doc.text(
      `Curs ${invoice.exchangeRate} RON/${invoice.currency} · TVA total: ${formatAmount(invoice.totalVatRon)} RON`,
      boxX,
      totalsBottom,
      { width: boxWidth, align: 'right' },
    );
    totalsBottom = doc.y;
  }
  doc.y = Math.max(y, totalsBottom) + 14;
}

function drawMentions(
  doc: PDFKit.PDFDocument,
  invoice: InvoiceData,
  ensureSpace: (height: number) => void,
): void {
  const mentions: string[] = [
    `Mod de plată: ${PAYMENT_LABELS[invoice.paymentMethod]}${
      invoice.paymentMethod === 'transfer' && invoice.seller.iban
        ? ` · IBAN ${invoice.seller.iban}`
        : ''
    }`,
  ];
  if (!invoice.seller.vatPayer) {
    mentions.push('Furnizor neplătitor de TVA.');
  }
  if (invoice.vatOnCollection) mentions.push('TVA la încasare.');
  const reasons = new Set(
    invoice.vatBreakdown
      .map((row) => row.exemptionReason)
      .filter((reason): reason is string => Boolean(reason)),
  );
  for (const reason of reasons) mentions.push(reason);
  if (invoice.notes) mentions.push(invoice.notes);

  doc.font(REGULAR).fontSize(9);
  const height = doc.heightOfString(mentions.join('\n'), { width: WIDTH }) + 24;
  ensureSpace(height);
  doc.font(BOLD).fontSize(8).fillColor(MUTED).text('MENȚIUNI', MARGIN, doc.y);
  doc.font(REGULAR).fontSize(9).fillColor(INK);
  for (const mention of mentions) {
    doc.text(mention, MARGIN, doc.y + 2, { width: WIDTH });
  }
}

function drawFooter(doc: PDFKit.PDFDocument): void {
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    doc.page.margins.bottom = 0;
    doc
      .font(REGULAR)
      .fontSize(7)
      .fillColor(MUTED)
      .text(
        `Document valabil fără semnătură și ștampilă · Generat cu SPVDirect · Pagina ${i + 1} din ${range.count}`,
        MARGIN,
        805,
        { width: WIDTH, align: 'center', lineBreak: false },
      );
  }
}
