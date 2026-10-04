import { BadGatewayException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AnafApiService } from '../../services/anaf-api.service.js';
import { SpvService } from './spv.service.js';

const BASE = 'https://webserviced.anaf.ro/SPVWS2/rest';

function setup() {
  const request = vi.fn();
  const service = new SpvService(
    { request } as unknown as AnafApiService,
    new ConfigService({ ANAF_SPV_ENDPOINT: BASE }),
  );
  return { service, request };
}

describe('SpvService.listMessages', () => {
  it('calls listaMesaje with zile and cif and maps the response', async () => {
    const { service, request } = setup();
    request.mockResolvedValue({
      status: 200,
      data: {
        titlu: 'Lista Mesaje disponibile din ultimele 50 zile',
        mesaje: [
          {
            id: '100000000',
            detalii: 'recipisa',
            cif: '8000000000',
            data_creare: '20.12.2017 12:00:00',
            id_solicitare: null,
            tip: 'RECIPISA',
          },
        ],
        cnp: '1111111111118',
        cui: '8000000000',
        serial: 'ABC',
      },
    });

    const list = await service.listMessages(1, 'conn', {
      zile: 50,
      cif: '8000000000',
    });

    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        accountantId: 1,
        connectionId: 'conn',
        service: 'SPV',
        baseUrl: BASE,
        path: '/listaMesaje',
        params: { zile: 50, cif: '8000000000' },
      }),
    );
    expect(list.messages).toEqual([
      {
        id: '100000000',
        details: 'recipisa',
        cif: '8000000000',
        createdAt: '20.12.2017 12:00:00',
        requestId: null,
        type: 'RECIPISA',
      },
    ]);
    expect(list.certSerial).toBe('ABC');
  });

  it('omits cif when not given and tolerates a missing mesaje array', async () => {
    const { service, request } = setup();
    request.mockResolvedValue({ status: 200, data: { titlu: 'x' } });
    const list = await service.listMessages(1, 'conn', { zile: 5 });
    expect(request.mock.calls[0][0].params).toEqual({ zile: 5 });
    expect(list.messages).toEqual([]);
  });

  it('turns a 200 body with eroare into a 400', async () => {
    const { service, request } = setup();
    request.mockResolvedValue({ status: 200, data: { eroare: 'Fără drept' } });
    await expect(service.listMessages(1, 'conn', { zile: 5 })).rejects.toThrow(
      new BadRequestException('ANAF: Fără drept'),
    );
  });

  it('maps a non-JSON body to 502', async () => {
    const { service, request } = setup();
    request.mockResolvedValue({ status: 200, data: '<html></html>' });
    await expect(
      service.listMessages(1, 'conn', { zile: 5 }),
    ).rejects.toBeInstanceOf(BadGatewayException);
  });
});

describe('SpvService.downloadMessage', () => {
  it('returns the PDF bytes with a filename', async () => {
    const { service, request } = setup();
    const pdf = Buffer.from('%PDF-1.4 data');
    request.mockResolvedValue({
      status: 200,
      data: pdf,
      headers: { 'content-type': 'application/pdf' },
    });

    const doc = await service.downloadMessage(1, 'conn', '100000000');

    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        path: '/descarcare',
        params: { id: '100000000' },
        responseType: 'arraybuffer',
        baseUrl: BASE,
      }),
    );
    expect(doc.content.equals(pdf)).toBe(true);
    expect(doc.contentType).toBe('application/pdf');
    expect(doc.filename).toBe('mesaj-100000000.pdf');
  });

  it('turns a JSON error body into a 400', async () => {
    const { service, request } = setup();
    request.mockResolvedValue({
      status: 200,
      data: Buffer.from(JSON.stringify({ eroare: 'Mesaj inexistent' })),
      headers: { 'content-type': 'application/json' },
    });
    await expect(service.downloadMessage(1, 'conn', '1')).rejects.toThrow(
      'ANAF: Mesaj inexistent',
    );
  });

  it('detects a JSON error even without a JSON content type', async () => {
    const { service, request } = setup();
    request.mockResolvedValue({
      status: 200,
      data: Buffer.from('{"eroare":"Nu aveți drept"}'),
      headers: {},
    });
    await expect(
      service.downloadMessage(1, 'conn', '1'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects an empty document', async () => {
    const { service, request } = setup();
    request.mockResolvedValue({
      status: 200,
      data: Buffer.alloc(0),
      headers: { 'content-type': 'application/pdf' },
    });
    await expect(
      service.downloadMessage(1, 'conn', '1'),
    ).rejects.toBeInstanceOf(BadGatewayException);
  });
});

describe('SpvService.createRequest', () => {
  it('maps the DTO to ANAF query parameters', async () => {
    const { service, request } = setup();
    request.mockResolvedValue({
      status: 200,
      data: {
        id_solicitare: 260149,
        parametri: 'an=2017, cui=8000000000',
        serial: 'S',
        cnp: '1111111111118',
        titlu: 'Transmitere cerere tip D101',
      },
    });

    const result = await service.createRequest(1, 'conn', {
      tip: 'Fisa Rol',
      cui: '8000000000',
      an: 2018,
      luna: 1,
      motiv: 'altele',
      numarInregistrare: 'INTERNT-1',
      cuiPunctDeLucru: '8000000001',
    });

    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        path: '/cerere',
        baseUrl: BASE,
        params: {
          tip: 'Fisa Rol',
          cui: '8000000000',
          an: 2018,
          luna: 1,
          motiv: 'altele',
          numar_inregistrare: 'INTERNT-1',
          cui_pui: '8000000001',
        },
      }),
    );
    expect(result).toEqual({
      requestId: '260149',
      parameters: 'an=2017, cui=8000000000',
      certSerial: 'S',
      cnp: '1111111111118',
      title: 'Transmitere cerere tip D101',
    });
  });

  it('sends only tip and cui when nothing else is given', async () => {
    const { service, request } = setup();
    request.mockResolvedValue({ status: 200, data: { id_solicitare: 1 } });
    await service.createRequest(1, 'conn', { tip: 'D300', cui: '123456' });
    expect(request.mock.calls[0][0].params).toEqual({
      tip: 'D300',
      cui: '123456',
    });
  });

  it('turns eroare into a 400', async () => {
    const { service, request } = setup();
    request.mockResolvedValue({
      status: 200,
      data: { eroare: 'Tip invalid', titlu: 'Cerere' },
    });
    await expect(
      service.createRequest(1, 'conn', { tip: 'X1', cui: '123456' }),
    ).rejects.toThrow('ANAF: Tip invalid');
  });

  it('fails when ANAF returns no request id', async () => {
    const { service, request } = setup();
    request.mockResolvedValue({ status: 200, data: { titlu: 'x' } });
    await expect(
      service.createRequest(1, 'conn', { tip: 'D300', cui: '123456' }),
    ).rejects.toBeInstanceOf(BadGatewayException);
  });
});
