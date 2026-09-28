import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateCompaniesDto, MAX_BULK_CUIS } from './company.dto.js';

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
