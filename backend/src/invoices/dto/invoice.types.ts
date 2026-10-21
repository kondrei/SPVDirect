import type { DownloadFile } from '../../common/download-file.js';
import type { Invoice } from '../invoice.entity.js';
import type { UNITS } from './invoice.constants.js';
import type { Currency, VatCategory } from './invoice.enums.js';

export type Unit = keyof typeof UNITS;

export interface InvoiceParty {
  name: string;
  cui: string | null;
  regCom: string | null;
  address: string;
  street: string | null;
  city: string | null;
  county: string | null;
  postalCode: string | null;
  iban: string | null;
  bank: string | null;
  email: string | null;
  phone: string | null;
  vatPayer: boolean;
}

export interface InvoiceLineInput {
  description: string;
  quantity: number;
  unit: Unit;
  unitPrice: number;
  vatRate: number;
  vatCategory: VatCategory;
  vatExemptionReason: string | null;
  stornoOfLine?: number;
}

export interface InvoiceLine extends InvoiceLineInput {
  netAmount: number;
}

export interface VatBreakdownRow {
  category: VatCategory;
  rate: number;
  exemptionReason: string | null;
  taxableAmount: number;
  vatAmount: number;
}

export interface InvoiceTotals {
  net: number;
  vat: number;
  gross: number;
  vatRon: number;
  breakdown: VatBreakdownRow[];
}

export type InvoiceFile = DownloadFile;

export interface DeliveryOptions {
  saveToStorage?: boolean;
  sendToEmail?: string | null;
}

export interface CreatedInvoice {
  invoice: Invoice;
  storageError: string | null;
  emailError: string | null;
}

export interface BuyerLookup extends InvoiceParty {
  inactive: boolean | null;
  eFactura: boolean | null;
}

export interface InvoiceLogo {
  content: Buffer;
  contentType: string;
}

export type InvoicePdfData = Pick<
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

export type InvoiceXmlData = Pick<
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

export type LineVatCategory = Exclude<VatCategory, VatCategory.NotSubject>;

export interface StornoFields {
  stornoOfSeries: string | null;
  stornoOfNumber: number | null;
  stornoOfIssueDate: string | null;
}

export interface LineSuggestion {
  description: string;
  quantity: number;
  unit: Unit;
  unitPrice: number;
  vatRate: number;
  vatCategory: VatCategory;
  currency: Currency;
  issueDate: string;
}

export interface StornoRequestLine {
  lineIndex: number;
  quantity: number;
}

export interface InvoiceSummary {
  id: number;
  companyId: number;
  series: string;
  number: number;
  issueDate: string;
  dueDate: string | null;
  sellerName: string;
  buyerName: string;
  buyerCui: string | null;
  currency: string;
  totalGross: number;
  stored: boolean;
  stornoOfInvoiceId: number | null;
  stornoOfSeries: string | null;
  stornoOfNumber: number | null;
  stornoed: boolean;
  emailedTo: string | null;
  emailedAt: string | null;
}

export interface InvoicePage {
  items: InvoiceSummary[];
  total: number;
  page: number;
  pageSize: number;
}

export type InvoiceDetail = Invoice & {
  remainingQuantities: number[] | null;
};
