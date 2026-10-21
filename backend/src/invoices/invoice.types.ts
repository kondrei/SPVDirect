import { VatCategory } from './dto/invoice.enums.js';
export const UNITS = {
  buc: 'H87',
  ore: 'HUR',
  zile: 'DAY',
  luni: 'MON',
  kg: 'KGM',
  m: 'MTR',
  mp: 'MTK',
  l: 'LTR',
  set: 'SET',
  serviciu: 'C62',
} as const;
export type Unit = keyof typeof UNITS;
export const UNIT_NAMES = Object.keys(UNITS) as Unit[];

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
