import { BadRequestException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  CreateCompaniesDto,
  MAX_BULK_CUIS,
  ParseCuiPipe,
  UpdateCompanyDto,
} from './company.dto.js';

async function check(body: Record<string, unknown>) {
  const dto = plainToInstance(CreateCompaniesDto, body);
  const errors = await validate(dto, {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  return {
    dto,
    errors: errors.flatMap((e) => Object.values(e.constraints ?? {})),
  };
}

describe('CreateCompaniesDto', () => {
  it('normalizes every CUI', async () => {
    const { dto, errors } = await check({
      cuis: ['RO 12345678', 'ro87654321', ' 123 '],
    });
    expect(errors).toEqual([]);
    expect(dto.cuis).toEqual(['12345678', '87654321', '123']);
  });

  it('rejects a list with an invalid CUI', async () => {
    const { errors } = await check({ cuis: ['12345678', 'ABC'] });
    expect(errors).toEqual(['Lista conține CUI-uri invalide']);
  });

  it('rejects non-string entries', async () => {
    const { errors } = await check({ cuis: [12345678] });
    expect(errors).toEqual(['Lista conține CUI-uri invalide']);
  });

  it('rejects an empty list and a missing list', async () => {
    expect((await check({ cuis: [] })).errors).toEqual([
      'Introduceți cel puțin un CUI',
    ]);
    expect((await check({})).errors).toContain('Lista de CUI-uri lipsește');
  });

  it(`rejects more than ${MAX_BULK_CUIS} CUIs`, async () => {
    const cuis = Array.from({ length: MAX_BULK_CUIS + 1 }, (_, i) =>
      String(10 + i),
    );
    expect((await check({ cuis })).errors).toEqual([
      `Puteți adăuga cel mult ${MAX_BULK_CUIS} firme odată`,
    ]);
  });
});

describe('UpdateCompanyDto invoicing details', () => {
  async function checkUpdate(body: Record<string, unknown>) {
    const dto = plainToInstance(UpdateCompanyDto, body);
    const errors = await validate(dto, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });
    return {
      dto,
      errors: errors.flatMap((e) => Object.values(e.constraints ?? {})),
    };
  }

  it('normalizes the IBAN and turns blank values into null', async () => {
    const { dto, errors } = await checkUpdate({
      iban: 'ro49 aaaa 1b31 0075 9384 0000',
      bankName: '  ',
      email: '',
      phone: ' 0256 000 000 ',
    });
    expect(errors).toEqual([]);
    expect(dto.iban).toBe('RO49AAAA1B31007593840000');
    expect(dto.bankName).toBeNull();
    expect(dto.email).toBeNull();
    expect(dto.phone).toBe('0256 000 000');
  });

  it('rejects an invalid IBAN, email and phone', async () => {
    const { errors } = await checkUpdate({
      iban: 'RO12',
      email: 'nu-este-email',
      phone: 'abc',
    });
    expect(errors).toEqual(
      expect.arrayContaining([
        'IBAN invalid',
        'Adresa de email este invalidă',
        'Număr de telefon invalid',
      ]),
    );
  });
});

describe('ParseCuiPipe', () => {
  const pipe = new ParseCuiPipe();

  it('strips RO and spaces from a valid CUI', () => {
    expect(pipe.transform(' ro 8765 4321 ')).toBe('87654321');
  });

  it.each(['1', '12345678901', 'ROabc', ''])('rejects %j with 400', (cui) => {
    expect(() => pipe.transform(cui)).toThrow(BadRequestException);
  });
});
