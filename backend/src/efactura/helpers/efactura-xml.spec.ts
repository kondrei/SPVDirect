import {
  anafStampToIso,
  parseStatusResponse,
  parseUploadResponse,
} from './efactura-xml.js';

const header = (attrs: string, inner = '') =>
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n<header xmlns="mfp:anaf:dgti:spv:respUploadFisier:v1" ${attrs}>${inner}</header>`;

describe('parseUploadResponse', () => {
  it('reads the upload index of an accepted file', () => {
    expect(
      parseUploadResponse(
        header(
          'dateResponse="202108051140" ExecutionStatus="0" index_incarcare="3828"',
        ),
      ),
    ).toEqual({ accepted: true, uploadIndex: '3828', error: null });
  });

  it('reads the error of a refused file', () => {
    const xml = header(
      'dateResponse="202108051144" ExecutionStatus="1"',
      '<Errors errorMessage="Marime fisier transmis mai mare de 10 MB."/>',
    );
    expect(parseUploadResponse(xml)).toEqual({
      accepted: false,
      uploadIndex: null,
      error: 'Marime fisier transmis mai mare de 10 MB.',
    });
  });

  it('does not accept a success status without an index', () => {
    expect(parseUploadResponse(header('ExecutionStatus="0"')).accepted).toBe(
      false,
    );
  });

  it('decodes XML entities in the error', () => {
    const xml = header(
      'ExecutionStatus="1"',
      '<Errors errorMessage="a &amp; b &lt;c&gt; &#259;"/>',
    );
    expect(parseUploadResponse(xml).error).toBe('a & b <c> ă');
  });
});

const state = (attrs: string) =>
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><header xmlns="mfp:anaf:dgti:efactura:stareMesajFactura:v1" ${attrs}/>`;

describe('parseStatusResponse', () => {
  it('maps ok with the download id', () => {
    expect(
      parseStatusResponse(state('stare="ok" id_descarcare="1234"')),
    ).toEqual({ status: 'ok', downloadId: '1234', error: null });
  });

  it('maps nok with the download id of the error file', () => {
    expect(
      parseStatusResponse(state('stare="nok" id_descarcare="123"')).status,
    ).toBe('nok');
  });

  it('maps in prelucrare to processing', () => {
    expect(parseStatusResponse(state('stare="in prelucrare"'))).toEqual({
      status: 'processing',
      downloadId: null,
      error: null,
    });
  });

  it('maps a file the system did not take over to rejected', () => {
    expect(
      parseStatusResponse(state('stare="XML cu erori nepreluat de sistem"'))
        .status,
    ).toBe('rejected');
  });

  it('returns the error of a refused query', () => {
    const xml =
      '<header xmlns="mfp:anaf:dgti:efactura:stareMesajFactura:v1"><Errors errorMessage="Nu exista factura cu id_incarcare= 15000"/></header>';
    expect(parseStatusResponse(xml)).toEqual({
      status: null,
      downloadId: null,
      error: 'Nu exista factura cu id_incarcare= 15000',
    });
  });

  it('leaves an unknown state unmapped', () => {
    expect(parseStatusResponse(state('stare="altceva"')).status).toBeNull();
  });
});

describe('anafStampToIso', () => {
  it('reads Bucharest time (winter and summer)', () => {
    expect(anafStampToIso('202212011000')).toBe('2022-12-01T08:00:00.000Z');
    expect(anafStampToIso('202210311452')).toBe('2022-10-31T12:52:00.000Z');
  });

  it('returns null for anything else', () => {
    expect(anafStampToIso('31.10.2022')).toBeNull();
    expect(anafStampToIso(undefined)).toBeNull();
  });
});
