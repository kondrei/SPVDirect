import { EfacturaDirection, EfacturaStandard } from '../dto/efactura.enums.js';
import type { EfacturaMessage, ParsedEinvoice } from '../dto/efactura.types.js';
import {
  directionOf,
  isCreditNote,
  isInvoiceMessage,
  likePattern,
} from './archive-view.js';

function invoice(supplier: string | null, customer: string | null) {
  return {
    supplier: { cui: supplier, name: null },
    customer: { cui: customer, name: null },
  } as ParsedEinvoice;
}

describe('directionOf', () => {
  it('reads the direction from the company CUI in the invoice', () => {
    expect(directionOf(invoice('1', '2'), '1', null)).toBe(
      EfacturaDirection.Sent,
    );
    expect(directionOf(invoice('1', '2'), '2', null)).toBe(
      EfacturaDirection.Received,
    );
  });

  it('falls back to the ANAF message type, then gives up', () => {
    expect(directionOf(invoice(null, null), '2', 'FACTURA PRIMITA')).toBe(
      EfacturaDirection.Received,
    );
    expect(directionOf(invoice(null, null), '2', ' factura trimisa ')).toBe(
      EfacturaDirection.Sent,
    );
    expect(directionOf(invoice('8', '9'), '2', 'ERORI FACTURA')).toBeNull();
    expect(directionOf(invoice('8', '9'), '2', null)).toBeNull();
  });
});

describe('isInvoiceMessage', () => {
  it.each([
    ['FACTURA PRIMITA', true],
    ['FACTURA TRIMISA', true],
    ['ERORI FACTURA', false],
    ['MESAJ CUMPARATOR PRIMIT / MESAJ CUMPARATOR TRANSMIS', false],
    [null, false],
  ])('%s -> %s', (type, expected) => {
    expect(isInvoiceMessage({ type } as EfacturaMessage)).toBe(expected);
  });
});

describe('isCreditNote', () => {
  it('is a UBL credit note or type code 381', () => {
    expect(
      isCreditNote({ standard: EfacturaStandard.CN, typeCode: null }),
    ).toBe(true);
    expect(
      isCreditNote({ standard: EfacturaStandard.CII, typeCode: '381' }),
    ).toBe(true);
    expect(
      isCreditNote({ standard: EfacturaStandard.UBL, typeCode: '380' }),
    ).toBe(false);
  });
});

describe('likePattern', () => {
  it('escapes the LIKE wildcards and the escape character', () => {
    expect(likePattern(String.raw`50%_a\b`)).toBe(String.raw`%50\%\_a\\b%`);
  });
});
