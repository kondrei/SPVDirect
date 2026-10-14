import type {
  BuyerLookup,
  Company,
  CreateInvoiceInput,
  InvoiceCurrency,
  InvoiceUnit,
  LineSuggestion,
  PaymentMethod,
} from '../../api/types';
import {
  decimalText,
  isValidCui,
  normalizeCui,
  parseDecimal,
} from '../../lib/format';
import { allowedVatRates, todayIso, ZERO_VAT_REASONS } from '../../lib/invoice';

export type ZeroReason = keyof typeof ZERO_VAT_REASONS;

export interface LineForm {
  key: number;
  description: string;
  quantity: string;
  unit: InvoiceUnit;
  unitPrice: string;
  vatRate: string;
  zeroReason: ZeroReason;
}

export interface BuyerForm {
  cui: string;
  name: string;
  regCom: string;
  address: string;
  iban: string;
  email: string;
  phone: string;
  street: string | null;
  city: string | null;
  county: string | null;
  postalCode: string | null;
  vatPayer: boolean;
}

export interface InvoiceHeader {
  companyId: number;
  series: string;
  number: string;
  issueDate: string;
  deliveryDate: string;
  dueDate: string;
  currency: InvoiceCurrency;
  exchangeRate: string;
  paymentMethod: PaymentMethod;
  notes: string;
}

export interface DeliveryForm {
  saveToStorage: boolean;
  sendEmail: boolean;
  emailTo: string | null;
}

export interface InvoiceFormState {
  header: InvoiceHeader;
  buyer: BuyerForm;
  lines: LineForm[];
  delivery: DeliveryForm;
}

export type InvoiceFormAction =
  | { type: 'header'; patch: Partial<InvoiceHeader> }
  | { type: 'buyer'; patch: Partial<BuyerForm> }
  | { type: 'buyerFound'; cui: string; found: BuyerLookup }
  | { type: 'line'; key: number; patch: Partial<LineForm> }
  | { type: 'addLine' }
  | { type: 'removeLine'; key: number }
  | { type: 'delivery'; patch: Partial<DeliveryForm> }
  | { type: 'reset' };

export const EMPTY_BUYER: BuyerForm = {
  cui: '',
  name: '',
  regCom: '',
  address: '',
  iban: '',
  email: '',
  phone: '',
  street: null,
  city: null,
  county: null,
  postalCode: null,
  vatPayer: false,
};

let nextLineKey = 1;

export function emptyLine(vatRate: number): LineForm {
  return {
    key: nextLineKey++,
    description: '',
    quantity: '1',
    unit: 'serviciu',
    unitPrice: '',
    vatRate: String(vatRate),
    zeroReason: 'E',
  };
}

export function vatRatesOn(deliveryDate: string): number[] {
  return allowedVatRates(deliveryDate || todayIso());
}

export function alignVatRates(lines: LineForm[], rates: number[]): LineForm[] {
  const allowed = rates.map(String);
  return lines.map((line) =>
    allowed.includes(line.vatRate) ? line : { ...line, vatRate: allowed[0] },
  );
}

export function emailRecipient(state: InvoiceFormState): string {
  return state.delivery.emailTo ?? state.buyer.email;
}

export function initialInvoiceForm(companyId: number): InvoiceFormState {
  const today = todayIso();
  return {
    header: {
      companyId,
      series: 'FCT',
      number: '',
      issueDate: today,
      deliveryDate: today,
      dueDate: '',
      currency: 'RON',
      exchangeRate: '',
      paymentMethod: 'transfer',
      notes: '',
    },
    buyer: EMPTY_BUYER,
    lines: [emptyLine(vatRatesOn(today)[0])],
    delivery: { saveToStorage: false, sendEmail: false, emailTo: null },
  };
}

export function buyerFromLookup(found: BuyerLookup, previous: BuyerForm): BuyerForm {
  return {
    cui: found.cui ?? previous.cui,
    name: found.name,
    regCom: found.regCom ?? '',
    address: found.address,
    iban: found.iban ?? '',
    email: found.email ?? previous.email,
    phone: found.phone ?? '',
    street: found.street,
    city: found.city,
    county: found.county,
    postalCode: found.postalCode,
    vatPayer: found.vatPayer,
  };
}

export function invoiceFormReducer(
  state: InvoiceFormState,
  action: InvoiceFormAction,
): InvoiceFormState {
  switch (action.type) {
    case 'header': {
      const header = { ...state.header, ...action.patch };
      const lines =
        header.deliveryDate === state.header.deliveryDate
          ? state.lines
          : alignVatRates(state.lines, vatRatesOn(header.deliveryDate));
      return { ...state, header, lines };
    }
    case 'buyer':
      return { ...state, buyer: { ...state.buyer, ...action.patch } };
    case 'buyerFound':
      return normalizeCui(state.buyer.cui) === action.cui
        ? { ...state, buyer: buyerFromLookup(action.found, state.buyer) }
        : state;
    case 'line':
      return {
        ...state,
        lines: state.lines.map((l) =>
          l.key === action.key ? { ...l, ...action.patch } : l,
        ),
      };
    case 'addLine':
      return {
        ...state,
        lines: [...state.lines, emptyLine(vatRatesOn(state.header.deliveryDate)[0])],
      };
    case 'removeLine':
      return { ...state, lines: state.lines.filter((l) => l.key !== action.key) };
    case 'delivery':
      return { ...state, delivery: { ...state.delivery, ...action.patch } };
    case 'reset': {
      const fresh = initialInvoiceForm(state.header.companyId);
      return {
        ...fresh,
        header: { ...state.header, number: '', notes: '' },
        lines: [emptyLine(vatRatesOn(state.header.deliveryDate)[0])],
      };
    }
  }
}

export function lineFromSuggestion(
  suggestion: LineSuggestion,
  vatPayer: boolean,
  rates: number[],
): Partial<LineForm> {
  const keepsRate =
    vatPayer && suggestion.vatCategory !== 'O' && rates.includes(suggestion.vatRate);
  return {
    description: suggestion.description,
    quantity: decimalText(suggestion.quantity),
    unit: suggestion.unit,
    unitPrice: decimalText(suggestion.unitPrice),
    ...(keepsRate ? { vatRate: String(suggestion.vatRate) } : {}),
    ...(keepsRate && suggestion.vatRate === 0 && suggestion.vatCategory in ZERO_VAT_REASONS
      ? { zeroReason: suggestion.vatCategory as ZeroReason }
      : {}),
  };
}

export function exchangeRateOf(header: InvoiceHeader): number | null {
  return header.currency === 'RON' ? null : parseDecimal(header.exchangeRate);
}

export function validateInvoiceForm(state: InvoiceFormState): string | null {
  const { header, buyer, lines, delivery } = state;
  const exchange = exchangeRateOf(header);
  if (!/^[A-Za-z0-9]{1,10}$/.test(header.series.trim())) {
    return 'Seria poate avea 1–10 litere sau cifre.';
  }
  if (header.number.trim() && !/^\d{1,6}$/.test(header.number.trim())) {
    return 'Numărul facturii trebuie să fie întreg, cel mult 6 cifre.';
  }
  if (!header.issueDate || !header.deliveryDate) {
    return 'Completați data emiterii și data livării.';
  }
  if (header.dueDate && header.dueDate < header.issueDate) {
    return 'Scadența nu poate fi înaintea datei emiterii.';
  }
  if (header.currency !== 'RON' && !(exchange && exchange > 0)) {
    return 'Introduceți cursul BNR pentru a calcula TVA în RON.';
  }
  if (!buyer.name.trim() || !buyer.address.trim()) {
    return 'Completați denumirea și adresa cumpărătorului.';
  }
  if (buyer.cui.trim() && !isValidCui(buyer.cui)) {
    return 'CUI-ul cumpărătorului este invalid.';
  }
  for (const [index, line] of lines.entries()) {
    if (!line.description.trim()) {
      return `Linia ${index + 1}: completați denumirea.`;
    }
    if (!(parseDecimal(line.quantity) > 0)) {
      return `Linia ${index + 1}: cantitatea trebuie să fie pozitivă.`;
    }
    if (!(parseDecimal(line.unitPrice) >= 0)) {
      return `Linia ${index + 1}: introduceți prețul unitar fără TVA.`;
    }
  }
  if (delivery.sendEmail && !/^\S+@\S+\.\S+$/.test(emailRecipient(state).trim())) {
    return 'Introduceți adresa de email la care se trimite factura.';
  }
  return null;
}

export function buildInvoicePayload(
  company: Company,
  state: InvoiceFormState,
): CreateInvoiceInput {
  const { header, buyer, lines, delivery } = state;
  const vatPayer = company.vatPayer === true;
  const blank = (value: string) => value.trim() || null;
  return {
    companyId: company.id,
    series: header.series.trim().toUpperCase(),
    ...(header.number.trim() ? { number: Number(header.number) } : {}),
    issueDate: header.issueDate,
    deliveryDate: header.deliveryDate,
    dueDate: blank(header.dueDate),
    currency: header.currency,
    exchangeRate: exchangeRateOf(header),
    paymentMethod: header.paymentMethod,
    notes: blank(header.notes),
    buyer: {
      name: buyer.name.trim(),
      address: buyer.address.trim(),
      cui: blank(normalizeCui(buyer.cui)),
      regCom: blank(buyer.regCom),
      iban: blank(buyer.iban),
      email: blank(buyer.email),
      phone: blank(buyer.phone),
      street: buyer.street,
      city: buyer.city,
      county: buyer.county,
      postalCode: buyer.postalCode,
      vatPayer: buyer.vatPayer,
    },
    lines: lines.map((line) => {
      const vatRate = vatPayer ? Number(line.vatRate) : 0;
      return {
        description: line.description.trim(),
        quantity: parseDecimal(line.quantity),
        unit: line.unit,
        unitPrice: parseDecimal(line.unitPrice),
        vatRate,
        ...(vatPayer && vatRate === 0 ? { vatCategory: line.zeroReason } : {}),
      };
    }),
    saveToStorage: delivery.saveToStorage,
    sendToEmail: delivery.sendEmail ? emailRecipient(state).trim() : null,
  };
}
