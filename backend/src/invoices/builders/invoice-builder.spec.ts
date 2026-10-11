import { BadRequestException } from '@nestjs/common';
import { anafTvaRecord } from '../../testing/anaf-tva-record.js';
import type { Company } from '../../companies/company.entity.js';
import type { InvoiceLineDto } from '../dto/invoice.dto.js';
import {
  buyerFromAnaf,
  buyerFromDto,
  normalizeLines,
  sellerFromCompany,
  validateInvoiceDates,
} from './invoice-builder.js';
import { allowedVatRates } from '../helpers/vat-rates.js';

function lineDto(overrides: Partial<InvoiceLineDto> = {}): InvoiceLineDto {
  return {
    description: 'Servicii',
    quantity: 1,
    unit: 'serviciu',
    unitPrice: 100,
    vatRate: 21,
    ...overrides,
  };
}

function company(overrides: Partial<Company> = {}): Company {
  return {
    id: 7,
    accountantId: 1,
    cui: '12345678',
    name: 'AGRO VEST SRL',
    regCom: 'J35/100/2010',
    address: 'JUD. TIMIŞ, MUN. TIMIŞOARA, STR. EXEMPLU, NR.1',
    vatPayer: true,
    iban: null,
    bankName: null,
    email: null,
    phone: null,
    anafData: anafTvaRecord(12345678, { iban: 'RO49AAAA1B31007593840000' }),
    ...overrides,
  } as Company;
}

describe('allowedVatRates', () => {
  it('uses 21/11/0 for deliveries from 1 August 2025', () => {
    expect(allowedVatRates('2025-08-01')).toEqual([21, 11, 0]);
    expect(allowedVatRates('2026-10-04')).toEqual([21, 11, 0]);
  });

  it('keeps the old 19/9/5/0 for earlier deliveries', () => {
    expect(allowedVatRates('2025-07-31')).toEqual([19, 9, 5, 0]);
  });
});

describe('sellerFromCompany', () => {
  it('uses the company data and falls back to the ANAF IBAN and phone', () => {
    const seller = sellerFromCompany(company());
    expect(seller).toMatchObject({
      name: 'AGRO VEST SRL',
      cui: '12345678',
      iban: 'RO49AAAA1B31007593840000',
      phone: '0256000000',
      county: 'RO-TM',
      vatPayer: true,
    });
  });

  it('prefers the IBAN, bank, email and phone saved on the company', () => {
    const seller = sellerFromCompany(
      company({
        iban: 'RO12BBBB1B31007593840001',
        bankName: 'Banca X',
        email: 'a@b.ro',
        phone: '0700',
      }),
    );
    expect(seller).toMatchObject({
      iban: 'RO12BBBB1B31007593840001',
      bank: 'Banca X',
      email: 'a@b.ro',
      phone: '0700',
    });
  });

  it('treats an unknown VAT status as not a VAT payer', () => {
    expect(sellerFromCompany(company({ vatPayer: null })).vatPayer).toBe(false);
  });

  it('refuses a company without address', () => {
    expect(() => sellerFromCompany(company({ address: null }))).toThrow(
      BadRequestException,
    );
  });
});

describe('buyer', () => {
  it('is filled from the ANAF record', () => {
    const buyer = buyerFromAnaf(
      anafTvaRecord(87654321, { iban: 'RO49AAAA1B31007593840000' }),
    );
    expect(buyer).toMatchObject({
      name: 'AGRO VEST SRL',
      cui: '87654321',
      vatPayer: true,
      iban: 'RO49AAAA1B31007593840000',
      postalCode: '300001',
      inactive: false,
      eFactura: true,
    });
  });

  it('comes from the submitted form, defaulting optional parts to null', () => {
    const buyer = buyerFromDto({ name: 'Ion Popescu', address: 'Str. A' });
    expect(buyer).toMatchObject({
      name: 'Ion Popescu',
      cui: null,
      iban: null,
      vatPayer: false,
    });
  });
});

describe('validateInvoiceDates', () => {
  const ok = { issueDate: '2026-10-04', deliveryDate: '2026-10-01' };

  it('accepts valid dates', () => {
    expect(() =>
      validateInvoiceDates({ ...ok, dueDate: '2026-10-30' }),
    ).not.toThrow();
  });

  it('rejects an impossible calendar date', () => {
    expect(() =>
      validateInvoiceDates({ ...ok, issueDate: '2026-02-30' }),
    ).toThrow(BadRequestException);
  });

  it('rejects a due date before the issue date', () => {
    expect(() =>
      validateInvoiceDates({ ...ok, dueDate: '2026-10-03' }),
    ).toThrow('Scadența');
  });
});

describe('normalizeLines', () => {
  it('marks taxed lines for a VAT payer as category S', () => {
    const [result] = normalizeLines([lineDto()], true, '2026-10-01');
    expect(result).toMatchObject({
      vatRate: 21,
      vatCategory: 'S',
      vatExemptionReason: null,
    });
  });

  it('rejects a rate that does not exist at the delivery date', () => {
    expect(() =>
      normalizeLines([lineDto({ vatRate: 19 })], true, '2026-10-01'),
    ).toThrow('cota de TVA 19%');
    expect(() =>
      normalizeLines([lineDto({ vatRate: 21 })], true, '2025-06-01'),
    ).toThrow('cota de TVA 21%');
  });

  it('requires a reason category for 0%', () => {
    expect(() =>
      normalizeLines([lineDto({ vatRate: 0 })], true, '2026-10-01'),
    ).toThrow('motivul pentru cota 0%');
  });

  it('fills the default legal text for an exempt line', () => {
    const [result] = normalizeLines(
      [lineDto({ vatRate: 0, vatCategory: 'AE' })],
      true,
      '2026-10-01',
    );
    expect(result.vatExemptionReason).toContain('Taxare inversă');
  });

  it('keeps a custom exemption text', () => {
    const [result] = normalizeLines(
      [
        lineDto({
          vatRate: 0,
          vatCategory: 'E',
          vatExemptionReason: 'Art. 293',
        }),
      ],
      true,
      '2026-10-01',
    );
    expect(result.vatExemptionReason).toBe('Art. 293');
  });

  it('rejects an exemption on a taxed line', () => {
    expect(() =>
      normalizeLines(
        [lineDto({ vatRate: 21, vatCategory: 'E' })],
        true,
        '2026-10-01',
      ),
    ).toThrow(BadRequestException);
  });

  it('removes VAT from every line when the seller is not a VAT payer', () => {
    const [result] = normalizeLines(
      [lineDto({ vatRate: 21 })],
      false,
      '2026-10-01',
    );
    expect(result).toMatchObject({ vatRate: 0, vatCategory: 'O' });
    expect(result.vatExemptionReason).toContain('neînregistrat');
  });
});
