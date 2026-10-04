import { BadRequestException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import {
  CreateSpvRequestDto,
  ListSpvMessagesQuery,
  ParseSpvMessageIdPipe,
} from './spv.dto.js';

function errors<T extends object>(cls: new () => T, plain: object) {
  return validateSync(plainToInstance(cls, plain)).map((e) => e.property);
}

describe('ListSpvMessagesQuery', () => {
  it('accepts zile as a numeric string and an optional cif', () => {
    expect(
      errors(ListSpvMessagesQuery, { zile: '50', cif: '800 000' }),
    ).toEqual([]);
  });

  it.each(['0', '61', 'abc', '1.5', ''])('rejects zile=%s', (zile) => {
    expect(errors(ListSpvMessagesQuery, { zile })).toContain('zile');
  });

  it('rejects a non-numeric cif', () => {
    expect(errors(ListSpvMessagesQuery, { zile: '5', cif: 'RO12' })).toContain(
      'cif',
    );
  });
});

describe('CreateSpvRequestDto', () => {
  it('accepts a minimal request', () => {
    expect(
      errors(CreateSpvRequestDto, { tip: 'D300', cui: '8000000000' }),
    ).toEqual([]);
  });

  it('rejects bad cui, luna and an', () => {
    expect(
      errors(CreateSpvRequestDto, {
        tip: 'D300',
        cui: 'abc',
        luna: 13,
        an: 1800,
      }).sort(),
    ).toEqual(['an', 'cui', 'luna']);
  });

  it('requires tip', () => {
    expect(errors(CreateSpvRequestDto, { cui: '123456' })).toContain('tip');
  });
});

describe('ParseSpvMessageIdPipe', () => {
  const pipe = new ParseSpvMessageIdPipe();

  it('keeps large numeric ids as strings', () => {
    expect(pipe.transform('99999999999')).toBe('99999999999');
  });

  it.each(['', 'abc', '1;2', '../1', '1'.repeat(21)])('rejects %s', (v) => {
    expect(() => pipe.transform(v)).toThrow(BadRequestException);
  });
});
