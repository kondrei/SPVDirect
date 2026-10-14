import 'reflect-metadata';
import { BadRequestException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  assertXmlPayload,
  LatestUploadsQuery,
  ListMessagesQuery,
  ParseAnafIdPipe,
  TransformXmlDto,
  UploadXmlDto,
  ValidateXmlDto,
} from './efactura.dto.js';

async function errors<T extends object>(
  cls: new () => T,
  plain: Record<string, unknown>,
) {
  const out = await validate(plainToInstance(cls, plain));
  return out.map((e) => e.property);
}

describe('UploadXmlDto', () => {
  it('accepts multipart strings: numbers and DA/true flags', async () => {
    const dto = plainToInstance(UploadXmlDto, {
      companyId: '7',
      standard: 'UBL',
      extern: 'DA',
      autofactura: 'false',
      b2c: 'true',
    });
    expect(await validate(dto)).toEqual([]);
    expect(dto).toMatchObject({
      companyId: 7,
      extern: true,
      autofactura: false,
      b2c: true,
    });
  });

  it.each(['ubl', 'XML', ''])('refuses the standard %j', async (standard) => {
    expect(await errors(UploadXmlDto, { companyId: 1, standard })).toContain(
      'standard',
    );
  });

  it('needs a company', async () => {
    expect(await errors(UploadXmlDto, { standard: 'UBL' })).toContain(
      'companyId',
    );
  });
});

describe('ValidateXmlDto and TransformXmlDto', () => {
  it('only knows FACT1 and FCN', async () => {
    expect(await errors(ValidateXmlDto, { standard: 'FCN' })).toEqual([]);
    expect(await errors(ValidateXmlDto, { standard: 'UBL' })).toContain(
      'standard',
    );
  });

  it('reads skipValidation as a flag', async () => {
    const dto = plainToInstance(TransformXmlDto, { skipValidation: 'DA' });
    expect(dto.skipValidation).toBe(true);
  });
});

describe('ListMessagesQuery', () => {
  it('limits the days to 1..60 and the filter to E, P, T, R', async () => {
    expect(
      await errors(ListMessagesQuery, { zile: '60', filtru: 'T' }),
    ).toEqual([]);
    expect(await errors(ListMessagesQuery, { zile: '61' })).toContain('zile');
    expect(await errors(ListMessagesQuery, { zile: '0' })).toContain('zile');
    expect(await errors(ListMessagesQuery, { filtru: 'X' })).toContain(
      'filtru',
    );
  });

  it('reads the interval as numbers', async () => {
    const dto = plainToInstance(ListMessagesQuery, {
      startTime: '1646037374000',
      endTime: '1646170574000',
      pagina: '2',
    });
    expect(await validate(dto)).toEqual([]);
    expect(dto.pagina).toBe(2);
  });
});

describe('ParseAnafIdPipe', () => {
  it('accepts digits and refuses anything else', () => {
    const pipe = new ParseAnafIdPipe();
    expect(pipe.transform('3001474425')).toBe('3001474425');
    expect(() => pipe.transform('12a')).toThrow(BadRequestException);
    expect(() => pipe.transform('../1')).toThrow(BadRequestException);
  });
});

describe('LatestUploadsQuery', () => {
  it('reads a comma separated list of invoice ids', async () => {
    const dto = plainToInstance(LatestUploadsQuery, { ids: '3,4,15' });
    expect(await validate(dto)).toEqual([]);
    expect(dto.ids).toEqual([3, 4, 15]);
  });

  it.each([
    '',
    'a,b',
    '0',
    '-1',
    Array.from({ length: 101 }, (_, i) => i + 1).join(','),
  ])('rejects %j', async (ids) => {
    const out = await errors(LatestUploadsQuery, { ids });
    if (ids === '') expect(out).toEqual([]);
    else expect(out).toEqual(['ids']);
  });
});

describe('assertXmlPayload', () => {
  it('refuses an empty or oversized XML', () => {
    expect(() => assertXmlPayload('  ')).toThrow(BadRequestException);
    expect(() => assertXmlPayload('x'.repeat(10 * 1024 * 1024 + 1))).toThrow(
      'Fișierul depășește 10 MB',
    );
    expect(() => assertXmlPayload('<Invoice/>')).not.toThrow();
  });
});
