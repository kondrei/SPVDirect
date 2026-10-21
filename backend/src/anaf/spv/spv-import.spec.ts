import {
  MAX_IMPORT_BYTES,
  MAX_IMPORT_MESSAGES,
  MAX_RIGHTS,
  MAX_SPV_PDF_BYTES,
  parseSpvExport,
  validateSpvPdf,
} from './spv-import.js';

const json = (value: unknown) => Buffer.from(JSON.stringify(value));

describe('parseSpvExport', () => {
  it('reads the list ANAF shows in the browser', () => {
    expect(
      parseSpvExport(
        json({
          titlu: 'Lista Mesaje disponibile din ultimele 50 zile',
          mesaje: [
            {
              id: '929663619',
              detalii: 'Document Fisa Rol pentru CIF=7234394',
              cif: '7234394',
              data_creare: '18.09.2026 08:16:32',
              id_solicitare: '193229752',
              tip: 'RASPUNS SOLICITARE',
            },
          ],
          cnp: '1111111111118',
          cui: '7234394,38745062',
          serial: 'abc',
        }),
      ),
    ).toEqual({
      title: 'Lista Mesaje disponibile din ultimele 50 zile',
      certSerial: 'abc',
      cuis: ['7234394', '38745062'],
      notice: null,
      messages: [
        {
          id: '929663619',
          details: 'Document Fisa Rol pentru CIF=7234394',
          cif: '7234394',
          createdAt: '18.09.2026 08:16:32',
          requestId: '193229752',
          type: 'RASPUNS SOLICITARE',
        },
      ],
    });
  });

  it('keeps only digit CUIs/CNPs from the rights list, once each', () => {
    expect(
      parseSpvExport(
        json({ mesaje: [], cui: ' 7234394, RO1,7234394,,1111111111118 ' }),
      ).cuis,
    ).toEqual(['7234394', '1111111111118']);
    expect(parseSpvExport(json({ mesaje: [], cui: 42 })).cuis).toEqual([]);
  });

  it('caps the rights list so the company lookup stays one bounded query', () => {
    const cui = Array.from({ length: MAX_RIGHTS + 10 }, (_, i) =>
      String(10_000_000 + i),
    ).join(',');
    expect(parseSpvExport(json({ mesaje: [], cui })).cuis).toHaveLength(
      MAX_RIGHTS,
    );
  });

  it('accepts a numeric id, a byte order mark and missing optional fields', () => {
    const content = Buffer.concat([
      Buffer.from('﻿'),
      json({ mesaje: [{ id: 42 }] }),
    ]);
    expect(parseSpvExport(content)).toMatchObject({
      title: null,
      certSerial: null,
      cuis: [],
      messages: [
        {
          id: '42',
          details: null,
          cif: null,
          createdAt: null,
          requestId: null,
          type: null,
        },
      ],
    });
  });

  it('treats "no messages" from ANAF as an empty list and keeps the reason', () => {
    expect(
      parseSpvExport(
        json({ eroare: 'Nu exista mesaje in ultimele 5 zile', titlu: 'x' }),
      ),
    ).toEqual({
      title: 'x',
      certSerial: null,
      cuis: [],
      notice: 'Nu exista mesaje in ultimele 5 zile',
      messages: [],
    });
  });

  it.each([
    [undefined, 'Lipiți sau încărcați lista'],
    [Buffer.alloc(0), 'Lipiți sau încărcați lista'],
    [
      Buffer.from('<html>Pagina logout</html>'),
      'nu este JSON-ul primit de la ANAF',
    ],
    [json([1, 2]), 'nu are formatul listei'],
    [json({ titlu: 'x' }), 'câmpul „mesaje”'],
    [json({ eroare: 'Nu aveti drept' }), 'ANAF: Nu aveti drept'],
    [json({ mesaje: ['x'] }), 'Mesajul 1 din listă nu are formatul ANAF'],
    [
      json({ mesaje: [{ id: '1' }, { id: '12a' }] }),
      'Mesajul 2 din listă nu are un id ANAF valid',
    ],
    [json({ mesaje: [{ id: '12a' }] }), 'nu are un id ANAF valid'],
    [json({ mesaje: [{ id: '1', tip: { a: 1 } }] }), 'câmpul „tip” invalid'],
  ])('rejects %#', (content, message) => {
    expect(() => parseSpvExport(content)).toThrow(message);
  });

  it('caps the file size and the number of messages', () => {
    expect(() =>
      parseSpvExport(Buffer.alloc(MAX_IMPORT_BYTES + 1, ' ')),
    ).toThrow('cel mult 5 MB');
    expect(() =>
      parseSpvExport(
        json({
          mesaje: Array.from({ length: MAX_IMPORT_MESSAGES + 1 }, (_, i) => ({
            id: String(i + 1),
          })),
        }),
      ),
    ).toThrow(`cel mult ${MAX_IMPORT_MESSAGES} de mesaje`);
  });
});

describe('validateSpvPdf', () => {
  it('accepts a PDF', () => {
    const pdf = Buffer.from('%PDF-1.7\n...');
    expect(validateSpvPdf(pdf)).toBe(pdf);
  });

  it.each([
    [undefined, 'Alegeți fișierul PDF'],
    [Buffer.from('<!DOCTYPE html>'), 'nu este un PDF'],
    [json({ titlu: 'x' }), 'nu este un PDF'],
    [Buffer.alloc(MAX_SPV_PDF_BYTES + 1), 'cel mult 10 MB'],
  ])('rejects %#', (content, message) => {
    expect(() => validateSpvPdf(content)).toThrow(message);
  });

  it('shows the reason when the saved file is the ANAF download error', () => {
    expect(() =>
      validateSpvPdf(
        json({
          titlu: 'Descarcare mesaj 100000000',
          eroare: 'Nu aveti dreptul sa descarcati acest mesaj',
        }),
      ),
    ).toThrow(
      'ANAF nu a dat documentul: Nu aveti dreptul sa descarcati acest mesaj',
    );
  });
});
