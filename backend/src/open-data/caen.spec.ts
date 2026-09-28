import { describeCaen, normalizeCaenCode, parseCaenCsv } from './caen.js';
import { CAEN_CSV } from '../testing/caen-csv.js';

describe('normalizeCaenCode', () => {
  it.each([
    ['6920', '6920'],
    [' 6920 ', '6920'],
    ['111', '0111'],
    ['', null],
    [null, null],
    [undefined, null],
    ['69201', null],
    ['69a0', null],
  ])('%j -> %j', (input, expected) => {
    expect(normalizeCaenCode(input)).toBe(expected);
  });
});

describe('parseCaenCsv', () => {
  it('keeps only Rev. 2 and Rev. 3 classes and collapses spaces', () => {
    const table = parseCaenCsv(CAEN_CSV);
    expect([...table.rev2.keys()]).toEqual(['0111', '6201', '6920']);
    expect([...table.rev3.keys()]).toEqual(['0111', '6210', '6920']);
    expect(table.rev3.get('6920')).toBe(
      'Activități de contabilitate și audit financiar; consultanță în domeniul fiscal',
    );
  });

  it('rejects a file with another header', () => {
    expect(() => parseCaenCsv('COD^DESCRIERE\r\n0^x')).toThrow(
      'Unexpected N_CAEN.CSV header',
    );
  });

  it('rejects a file without Rev. 2 or Rev. 3 classes', () => {
    expect(() =>
      parseCaenCsv(
        'SECTIUNEA^SUBSECTIUNEA^DIVIZIUNEA^GRUPA^CLASA^DENUMIRE^VERSIUNE_CAEN\r\nA^^01^011^0111^x^0',
      ),
    ).toThrow('no Rev. 2 or Rev. 3');
  });
});

describe('describeCaen', () => {
  const table = parseCaenCsv(CAEN_CSV);

  it('prefers the Rev. 3 name and hides an identical Rev. 2 name', () => {
    expect(describeCaen(table, '6920')).toEqual({
      code: '6920',
      name: 'Activități de contabilitate și audit financiar; consultanță în domeniul fiscal',
      revision: 3,
      rev2Name: null,
    });
  });

  it('adds the Rev. 2 name when the code meant something else', () => {
    expect(describeCaen(table, '0111')).toMatchObject({
      revision: 3,
      rev2Name: expect.stringContaining('exclusiv orez') as unknown,
    });
  });

  it('falls back to Rev. 2 for codes that no longer exist in Rev. 3', () => {
    expect(describeCaen(table, '6201')).toMatchObject({
      revision: 2,
      rev2Name: null,
    });
  });

  it('pads three-digit codes', () => {
    expect(describeCaen(table, '111')?.code).toBe('0111');
  });

  it('returns null for unknown or missing codes', () => {
    expect(describeCaen(table, '0000')).toBeNull();
    expect(describeCaen(table, null)).toBeNull();
    expect(describeCaen(table, 'toString')).toBeNull();
  });
});
