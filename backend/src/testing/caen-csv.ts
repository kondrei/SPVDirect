export const CAEN_CSV = [
  '﻿SECTIUNEA^SUBSECTIUNEA^DIVIZIUNEA^GRUPA^CLASA^DENUMIRE^VERSIUNE_CAEN',
  'A^^01^011^0111^Cultura cerealelor^0',
  'J^^62^621^6210^Transporturi aeriene după grafic^1',
  'A^  ^01^011^0111^Cultivarea cerealelor (exclusiv orez), plantelor leguminoase și a plantelor producătoare de semințe oleaginoase^2',
  'A^  ^01^011^0111^Cultivarea cerealelor (excluzând orezul), plantelor leguminoase și a plantelor oleaginoase^3',
  'J^  ^62^620^6201^Activități de realizare a soft-ului la comandă (software orientat client)^2',
  'K^  ^62^621^6210^Activități de realizare a soft-ului la comandă (software orientat client)^3',
  'M^  ^69^692^6920^Activități de contabilitate și audit financiar; consultanță în domeniul fiscal^2',
  'N^  ^69^692^6920^Activități de contabilitate  și audit financiar; consultanță în domeniul fiscal^3',
  'M^  ^69^^^Diviziune fără clasă^3',
  '',
].join('\r\n');

export const CAEN_SEARCH = {
  success: true,
  result: {
    results: [
      {
        name: 'firme-02-09-2026',
        resources: [{ name: 'N_CAEN.CSV', url: 'https://example.test/firme' }],
      },
      {
        name: 'nomenclatoare-02-09-2026',
        resources: [
          { name: 'N_STARE_FIRMA.CSV', url: 'https://example.test/stare' },
          { name: 'N_CAEN.CSV', url: 'https://example.test/n_caen.csv' },
        ],
      },
    ],
  },
};
