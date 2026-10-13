import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateInvoiceDto, LineSuggestionsQuery } from './invoice.dto.js';

function body(overrides: Record<string, unknown> = {}) {
  return {
    companyId: 7,
    series: ' fct ',
    issueDate: '2026-10-04',
    deliveryDate: '2026-10-01',
    currency: 'RON',
    paymentMethod: 'transfer',
    buyer: {
      name: ' Client SRL ',
      cui: 'RO 87654321',
      address: 'Str. B',
      iban: 'ro49 aaaa 1b31 0075 9384 0000',
      email: '',
    },
    lines: [
      {
        description: 'Servicii',
        quantity: 1.5,
        unit: 'ore',
        unitPrice: 99.99,
        vatRate: 21,
      },
    ],
    ...overrides,
  };
}

async function check(input: Record<string, unknown>) {
  const dto = plainToInstance(CreateInvoiceDto, input);
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

describe('CreateInvoiceDto', () => {
  it('accepts a valid invoice and normalizes text fields', async () => {
    const { dto, messages } = await check(body());
    expect(messages).toEqual([]);
    expect(dto.series).toBe('FCT');
    expect(dto.buyer.name).toBe('Client SRL');
    expect(dto.buyer.cui).toBe('87654321');
    expect(dto.buyer.iban).toBe('RO49AAAA1B31007593840000');
    expect(dto.buyer.email).toBeNull();
  });

  it('requires at least one line', async () => {
    const { messages } = await check(body({ lines: [] }));
    expect(messages).toContain('Adăugați cel puțin o linie pe factură');
  });

  it('rejects a non positive quantity and a negative price', async () => {
    const { messages } = await check(
      body({
        lines: [
          {
            description: 'x',
            quantity: 0,
            unit: 'buc',
            unitPrice: -1,
            vatRate: 21,
          },
        ],
      }),
    );
    expect(messages).toContain('Cantitatea trebuie să fie pozitivă');
    expect(messages).toContain('Prețul nu poate fi negativ');
  });

  it('rejects an unknown unit, currency and payment method', async () => {
    const { messages } = await check(
      body({
        currency: 'XXX',
        paymentMethod: 'cripto',
        lines: [
          {
            description: 'x',
            quantity: 1,
            unit: 'tone',
            unitPrice: 1,
            vatRate: 21,
          },
        ],
      }),
    );
    expect(messages).toEqual(
      expect.arrayContaining([
        'Unitate de măsură invalidă',
        'Monedă neacceptată',
        'Mod de plată invalid',
      ]),
    );
  });

  it('rejects wrongly formatted dates, series and buyer data', async () => {
    const { messages } = await check(
      body({
        issueDate: '04.10.2026',
        series: 'AB-1',
        buyer: { name: 'X', address: 'Y', cui: '1', iban: 'RO12' },
      }),
    );
    expect(messages).toEqual(
      expect.arrayContaining([
        'Data trebuie să fie în formatul AAAA-LL-ZZ',
        'Seria poate avea 1–10 litere sau cifre',
        'CUI cumpărător invalid',
        'IBAN invalid',
      ]),
    );
  });

  it('rejects the O category, which the server decides', async () => {
    const { messages } = await check(
      body({
        lines: [
          {
            description: 'x',
            quantity: 1,
            unit: 'buc',
            unitPrice: 1,
            vatRate: 0,
            vatCategory: 'O',
          },
        ],
      }),
    );
    expect(messages).toContain('Categorie TVA invalidă');
  });

  it('rejects unknown properties', async () => {
    const { messages } = await check(body({ totalGross: 1 }));
    expect(messages.join()).toContain('should not exist');
  });

  it('rejects an invalid email to send to', async () => {
    const { messages } = await check(body({ sendToEmail: 'nu-este-email' }));
    expect(messages).toContain('Adresa de email este invalidă');
  });
});

describe('LineSuggestionsQuery', () => {
  async function query(input: Record<string, unknown>) {
    const dto = plainToInstance(LineSuggestionsQuery, input);
    const errors = await validate(dto, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });
    return { dto, errors };
  }

  it('reads the company id and strips RO and spaces from the buyer CUI', async () => {
    const { dto, errors } = await query({ companyId: '7', buyerCui: 'RO 87654321' });
    expect(errors).toHaveLength(0);
    expect(dto).toMatchObject({ companyId: 7, buyerCui: '87654321' });
  });

  it('rejects an invalid CUI or a missing company', async () => {
    expect((await query({ companyId: '7', buyerCui: 'abc' })).errors).toHaveLength(1);
    expect((await query({ buyerCui: '87654321' })).errors).toHaveLength(1);
  });
});
