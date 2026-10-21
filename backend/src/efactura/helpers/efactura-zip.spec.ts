import { BadRequestException } from '@nestjs/common';
import { strToU8, zipSync } from 'fflate';
import { anafZip, ublInvoice } from '../../testing/efactura-fixtures.js';
import { extractInvoiceXml } from './efactura-zip.js';

describe('extractInvoiceXml', () => {
  it('returns the invoice XML, not the ANAF signature, with the upload index from its name', () => {
    expect(extractInvoiceXml(anafZip(ublInvoice(), '5001120362'))).toEqual({
      xml: ublInvoice(),
      uploadIndex: '5001120362',
    });
  });

  it('drops a byte order mark', () => {
    const zip = Buffer.from(
      zipSync({
        'factura.xml': strToU8(String.fromCodePoint(0xfeff) + '<Invoice/>'),
      }),
    );
    expect(extractInvoiceXml(zip)).toEqual({
      xml: '<Invoice/>',
      uploadIndex: null,
    });
  });

  it('finds nothing in an archive with only the signature', () => {
    const zip = Buffer.from(
      zipSync({ 'semnatura_1.xml': strToU8('<Signature/>') }),
    );
    expect(extractInvoiceXml(zip)).toBeNull();
  });

  it('refuses an archive with too many entries', () => {
    const entries: Record<string, Uint8Array> = {};
    for (let i = 0; i < 11; i++) entries[`${i}.txt`] = strToU8('x');
    expect(() => extractInvoiceXml(Buffer.from(zipSync(entries)))).toThrow(
      'Arhiva ANAF este prea mare',
    );
  });

  it('refuses an archive that inflates past the size limit', () => {
    const zip = Buffer.from(
      zipSync({ 'big.xml': new Uint8Array(21 * 1024 * 1024) }, { level: 9 }),
    );
    expect(zip.length).toBeLessThan(1024 * 1024);
    expect(() => extractInvoiceXml(zip)).toThrow('Arhiva ANAF este prea mare');
  });

  it('refuses bytes that are not a ZIP', () => {
    expect(() => extractInvoiceXml(Buffer.from('not a zip'))).toThrow(
      BadRequestException,
    );
  });
});
