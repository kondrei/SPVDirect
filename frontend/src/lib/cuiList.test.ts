import { describe, expect, it } from 'vitest';
import { cuisFromFile, parseCuiList } from './cuiList';

describe('parseCuiList', () => {
  it('splits on commas, semicolons and new lines and normalizes each CUI', () => {
    expect(parseCuiList('RO 14399840, 123;\n ro4567 \r\n\t89')).toEqual({
      cuis: ['14399840', '123', '4567', '89'],
      invalid: [],
    });
  });

  it('drops duplicates, including leading-zero variants', () => {
    expect(parseCuiList('123, RO123, 0123, 45').cuis).toEqual(['123', '45']);
  });

  it('reports invalid entries and ignores empty ones', () => {
    expect(parseCuiList('12A, , 1, 12345678901, ,99')).toEqual({
      cuis: ['99'],
      invalid: ['12A', '1', '12345678901'],
    });
  });

  it('strips CSV quotes', () => {
    expect(parseCuiList('"RO 123","456"').cuis).toEqual(['123', '456']);
  });
});

describe('cuisFromFile', () => {
  it('reads one CUI per line from a txt file', () => {
    expect(cuisFromFile('14399840\nRO 123\n\n456\n')).toEqual([
      '14399840',
      '123',
      '456',
    ]);
  });

  it('takes the first valid cell of each CSV row and skips the header', () => {
    const csv =
      '﻿CUI;Denumire;Telefon\r\n"RO14399840";"AGRO SRL";0256000000\r\n123,Alta firma,\r\nfără cui,x\r\n';
    expect(cuisFromFile(csv)).toEqual(['14399840', '123']);
  });

  it('returns nothing for a file without CUIs', () => {
    expect(cuisFromFile('nume\nion\n')).toEqual([]);
  });
});
