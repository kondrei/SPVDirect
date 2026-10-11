import type { Invoice } from '../invoices/invoice.entity.js';
import { computeInvoice } from '../invoices/helpers/invoice-calc.js';
import type {
  InvoiceLineInput,
  InvoiceParty,
} from '../invoices/invoice.types.js';

export function party(overrides: Partial<InvoiceParty> = {}): InvoiceParty {
  return {
    name: 'AGRO VEST SRL',
    cui: '12345678',
    regCom: 'J35/100/2010',
    address: 'JUD. TIMIŞ, MUN. TIMIŞOARA, STR. EXEMPLU, NR.1',
    street: 'Str. Exemplu, nr. 1',
    city: 'Mun. Timişoara',
    county: 'RO-TM',
    postalCode: '300001',
    iban: 'RO49AAAA1B31007593840000',
    bank: 'Banca Exemplu',
    email: 'office@agrovest.ro',
    phone: '0256000000',
    vatPayer: true,
    ...overrides,
  };
}

export function line(
  overrides: Partial<InvoiceLineInput> = {},
): InvoiceLineInput {
  return {
    description: 'Servicii de contabilitate',
    quantity: 1,
    unit: 'serviciu',
    unitPrice: 100,
    vatRate: 21,
    vatCategory: 'S',
    vatExemptionReason: null,
    ...overrides,
  };
}

export function sampleInvoice(overrides: Partial<Invoice> = {}): Invoice {
  const computed = computeInvoice(
    [line(), line({ unitPrice: 50, vatRate: 11 })],
    null,
  );
  return {
    id: 1,
    accountantId: 1,
    companyId: 7,
    series: 'FCT',
    number: 12,
    issueDate: '2026-10-04',
    deliveryDate: '2026-10-01',
    dueDate: '2026-10-30',
    currency: 'RON',
    exchangeRate: null,
    paymentMethod: 'transfer',
    vatOnCollection: false,
    seller: party(),
    buyer: party({
      name: 'CLIENT EXEMPLU SRL',
      cui: '87654321',
      regCom: 'J40/1/2015',
      address: 'MUN. BUCUREŞTI, SECTOR 3, STR. CLIENT, NR.2',
      street: 'Str. Client, nr. 2',
      city: 'SECTOR3',
      county: 'RO-B',
      iban: null,
      bank: null,
      email: 'client@exemplu.ro',
    }),
    lines: computed.lines,
    vatBreakdown: computed.totals.breakdown,
    totalNet: computed.totals.net,
    totalVat: computed.totals.vat,
    totalGross: computed.totals.gross,
    totalVatRon: computed.totals.vatRon,
    stornoOfInvoiceId: null,
    stornoOfSeries: null,
    stornoOfNumber: null,
    stornoOfIssueDate: null,
    notes: null,
    storagePath: null,
    emailedTo: null,
    emailedAt: null,
    createdAt: new Date('2026-10-04T10:00:00Z'),
    ...overrides,
  };
}
