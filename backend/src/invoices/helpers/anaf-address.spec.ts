import { anafTvaRecord } from '../../testing/anaf-tva-record.js';
import { parseAnafAddress } from './anaf-address.js';

describe('parseAnafAddress', () => {
  it('reads street, city, ISO county and postal code from the registered seat', () => {
    expect(parseAnafAddress(anafTvaRecord())).toEqual({
      street: 'Str. Exemplu, nr. 1',
      city: 'Mun. Timişoara',
      county: 'RO-TM',
      postalCode: '300001',
    });
  });

  it('writes Bucharest as SECTORn, as CIUS-RO requires', () => {
    const record = anafTvaRecord();
    record.adresa_sediu_social = {
      ...record.adresa_sediu_social,
      scod_JudetAuto: 'B',
      sdenumire_Localitate: 'Sector 3 Municipiul Bucureşti',
    };
    const parsed = parseAnafAddress(record);
    expect(parsed.city).toBe('SECTOR3');
    expect(parsed.county).toBe('RO-B');
  });

  it('returns empty parts when ANAF sent no address', () => {
    expect(parseAnafAddress(null)).toEqual({
      street: null,
      city: null,
      county: null,
      postalCode: null,
    });
  });
});
