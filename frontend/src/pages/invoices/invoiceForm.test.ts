import { describe, expect, it } from 'vitest';
import type { Company } from '../../api/types';
import {
  buildInvoicePayload,
  emailRecipient,
  initialInvoiceForm,
  invoiceFormReducer,
  validateInvoiceForm,
  type InvoiceFormState,
} from './invoiceForm';

const COMPANY = { id: 7, vatPayer: true } as Company;

function filled(): InvoiceFormState {
  let state = initialInvoiceForm(7);
  state = invoiceFormReducer(state, {
    type: 'header',
    patch: { deliveryDate: '2026-10-01', issueDate: '2026-10-02' },
  });
  state = invoiceFormReducer(state, {
    type: 'buyer',
    patch: { name: 'CLIENT A SRL', address: 'Str. A', email: 'a@client.ro' },
  });
  return invoiceFormReducer(state, {
    type: 'line',
    key: state.lines[0].key,
    patch: { description: 'Servicii', unitPrice: '100' },
  });
}

describe('invoiceFormReducer VAT rates', () => {
  it('moves a line to a rate that exists on the new delivery date', () => {
    const state = filled();
    expect(state.lines[0].vatRate).toBe('21');
    const before = invoiceFormReducer(state, {
      type: 'header',
      patch: { deliveryDate: '2025-07-15' },
    });
    expect(before.lines[0].vatRate).toBe('19');
    expect(buildInvoicePayload(COMPANY, before).lines[0].vatRate).toBe(19);
  });

  it('keeps a rate that is valid on both dates', () => {
    let state = filled();
    state = invoiceFormReducer(state, {
      type: 'line',
      key: state.lines[0].key,
      patch: { vatRate: '0' },
    });
    state = invoiceFormReducer(state, {
      type: 'header',
      patch: { deliveryDate: '2025-07-15' },
    });
    expect(state.lines[0].vatRate).toBe('0');
  });

  it('adds lines with the standard rate of the delivery date', () => {
    let state = invoiceFormReducer(filled(), {
      type: 'header',
      patch: { deliveryDate: '2025-07-15' },
    });
    state = invoiceFormReducer(state, { type: 'addLine' });
    expect(state.lines[1].vatRate).toBe('19');
  });
});

describe('invoiceFormReducer email recipient', () => {
  it('follows the buyer email until the user types another address', () => {
    let state = invoiceFormReducer(filled(), {
      type: 'delivery',
      patch: { sendEmail: true },
    });
    expect(emailRecipient(state)).toBe('a@client.ro');
    state = invoiceFormReducer(state, {
      type: 'buyer',
      patch: { email: 'b@client.ro' },
    });
    expect(emailRecipient(state)).toBe('b@client.ro');
    state = invoiceFormReducer(state, {
      type: 'delivery',
      patch: { emailTo: 'office@client.ro' },
    });
    state = invoiceFormReducer(state, {
      type: 'buyer',
      patch: { email: 'c@client.ro' },
    });
    expect(buildInvoicePayload(COMPANY, state).sendToEmail).toBe(
      'office@client.ro',
    );
  });

  it('forgets the previous recipient when a new invoice starts', () => {
    let state = invoiceFormReducer(filled(), {
      type: 'delivery',
      patch: { sendEmail: true, emailTo: 'a@client.ro' },
    });
    state = invoiceFormReducer(state, { type: 'reset' });
    expect(state.delivery).toEqual({
      saveToStorage: false,
      sendEmail: false,
      emailTo: null,
    });
    expect(state.buyer.email).toBe('');
    expect(state.header.series).toBe('FCT');
    expect(state.header.deliveryDate).toBe('2026-10-01');
    state = invoiceFormReducer(state, {
      type: 'buyer',
      patch: { email: 'b@client.ro' },
    });
    expect(emailRecipient(state)).toBe('b@client.ro');
  });

  it('asks for an address when email is on and there is none', () => {
    let state = invoiceFormReducer(filled(), {
      type: 'buyer',
      patch: { email: '' },
    });
    state = invoiceFormReducer(state, {
      type: 'delivery',
      patch: { sendEmail: true },
    });
    expect(validateInvoiceForm(state)).toMatch(/adresa de email/);
  });
});

describe('invoiceFormReducer buyer autofill', () => {
  it('ignores an answer for a CUI the user has since changed', () => {
    let state = invoiceFormReducer(filled(), {
      type: 'buyer',
      patch: { cui: 'RO 222' },
    });
    state = invoiceFormReducer(state, {
      type: 'buyerFound',
      cui: '111',
      found: {
        cui: '111',
        name: 'ALT SRL',
        address: 'x',
        regCom: null,
        iban: null,
        bank: null,
        email: null,
        phone: null,
        street: null,
        city: null,
        county: null,
        postalCode: null,
        vatPayer: true,
        inactive: false,
        eFactura: true,
      },
    });
    expect(state.buyer.name).toBe('CLIENT A SRL');
  });
});
