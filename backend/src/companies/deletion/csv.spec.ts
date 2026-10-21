import { BOM, toCsv } from './csv.js';

describe('toCsv', () => {
  it('writes a UTF-8 BOM, semicolons and CRLF line ends for Excel', () => {
    expect(toCsv(['a', 'b'], [['x', 1]])).toBe(`${BOM}a;b\r\nx;1\r\n`);
  });

  it('quotes cells with separators, quotes or new lines', () => {
    expect(toCsv(['a'], [['S.R.L; "Alfa"\nBeta']])).toBe(
      `${BOM}a\r\n"S.R.L; ""Alfa""\nBeta"\r\n`,
    );
  });

  it('writes empty cells for null and ISO dates for Date values', () => {
    expect(
      toCsv(
        ['a', 'b', 'c'],
        [[null, undefined, new Date('2026-10-19T08:00:00Z')]],
      ),
    ).toBe(`${BOM}a;b;c\r\n;;2026-10-19T08:00:00.000Z\r\n`);
  });

  it('defuses text that a spreadsheet would run as a formula', () => {
    expect(toCsv(['a'], [['=HYPERLINK("x")'], ['@SUM(A1)'], ['-2+3']])).toBe(
      `${BOM}a\r\n"'=HYPERLINK(""x"")"\r\n'@SUM(A1)\r\n'-2+3\r\n`,
    );
  });

  it('keeps negative numbers as numbers', () => {
    expect(toCsv(['a'], [[-100.5], [true]])).toBe(
      `${BOM}a\r\n-100.5\r\ntrue\r\n`,
    );
  });
});
