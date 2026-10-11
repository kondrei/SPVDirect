import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import type { HttpService } from '@nestjs/axios';
import type { ConfigService } from '@nestjs/config';
import type { Repository } from 'typeorm';
import type { AnafApiService } from '../../anaf/services/anaf-api.service.js';
import type { ApiLogsService } from '../../api-logs/api-logs.service.js';
import type { Company } from '../../companies/company.entity.js';
import type { CompaniesService } from '../../companies/services/companies.service.js';
import type { InvoicesService } from '../../invoices/services/invoices.service.js';
import { sampleInvoice } from '../../testing/invoice-fixtures.js';
import type { EfacturaUpload } from '../efactura-upload.entity.js';
import { EfacturaService, NO_CERTIFICATE } from './efactura.service.js';

const CONNECTION = '11111111-1111-4111-8111-111111111111';
const COMPANY = {
  id: 7,
  cui: '12345678',
  anafConnectionId: CONNECTION,
} as Company;

const noCertificate = () =>
  Object.assign({}, COMPANY, { anafConnectionId: null }) as Company;

const accepted =
  '<header xmlns="mfp:anaf:dgti:spv:respUploadFisier:v1" ExecutionStatus="0" index_incarcare="3828"/>';
const refused =
  '<header xmlns="mfp:anaf:dgti:spv:respUploadFisier:v1" ExecutionStatus="1"><Errors errorMessage="Valorile acceptate pentru parametrul standard sunt UBL, CN, CII sau RASP"/></header>';
const stare = (attrs: string) =>
  `<header xmlns="mfp:anaf:dgti:efactura:stareMesajFactura:v1" ${attrs}/>`;

function upload(overrides: Partial<EfacturaUpload> = {}): EfacturaUpload {
  return {
    id: 5,
    accountantId: 1,
    companyId: 7,
    invoiceId: null,
    anafConnectionId: CONNECTION,
    environment: 'test',
    standard: 'UBL',
    uploadIndex: '3828',
    status: 'processing',
    downloadId: null,
    errorMessage: null,
    checkedAt: null,
    createdAt: new Date('2026-10-05T08:00:00Z'),
    ...overrides,
  };
}

function setup({ company = COMPANY }: { company?: Company } = {}) {
  const api = {
    envPath: vi.fn((p: string) => `/test${p}`),
    request: vi.fn().mockResolvedValue({ status: 200, data: accepted }),
  };
  const http = {
    axiosRef: {
      post: vi.fn().mockResolvedValue({
        status: 200,
        data: { stare: 'ok', trace_id: 't-1' },
      }),
    },
  };
  const config = {
    getOrThrow: vi.fn((key: string) =>
      key === 'ANAF_ENV' ? 'test' : 'https://validator.example/prod/FCTEL/rest',
    ),
  };
  const apiLogs = { record: vi.fn().mockResolvedValue(undefined) };
  const companies = { get: vi.fn().mockResolvedValue(company) };
  const invoices = {
    get: vi.fn().mockResolvedValue(sampleInvoice({ companyId: 7 })),
    downloadXml: vi.fn().mockResolvedValue({ content: '<Invoice/>' }),
  };
  const uploads = {
    create: vi.fn((d: Partial<EfacturaUpload>) => ({ ...d })),
    save: vi.fn((u: EfacturaUpload) =>
      Promise.resolve(Object.assign({ id: 5 }, u)),
    ),
    findOne: vi.fn().mockResolvedValue(null),
    findOneBy: vi.fn().mockResolvedValue(upload()),
    findAndCount: vi.fn().mockResolvedValue([[upload()], 1]),
  };
  const service = new EfacturaService(
    api as unknown as AnafApiService,
    config as unknown as ConfigService,
    http as unknown as HttpService,
    apiLogs as unknown as ApiLogsService,
    companies as unknown as CompaniesService,
    invoices as unknown as InvoicesService,
    uploads as unknown as Repository<EfacturaUpload>,
  );
  return { service, api, http, apiLogs, companies, invoices, uploads };
}

const input = {
  companyId: 7,
  xml: '<Invoice/>',
  standard: 'UBL' as const,
};

describe('EfacturaService.upload', () => {
  it('posts the XML for the company CUI and keeps the upload index', async () => {
    const { service, api, uploads } = setup();
    const saved = await service.upload(1, { ...input, extern: true });
    expect(api.request).toHaveBeenCalledWith(
      expect.objectContaining({
        accountantId: 1,
        connectionId: CONNECTION,
        method: 'POST',
        path: '/test/FCTEL/rest/upload',
        params: { standard: 'UBL', cif: '12345678', extern: 'DA' },
        data: '<Invoice/>',
        allowStatuses: [400],
      }),
    );
    expect(uploads.create).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'processing',
        uploadIndex: '3828',
        environment: 'test',
        errorMessage: null,
      }),
    );
    expect(saved.uploadIndex).toBe('3828');
  });

  it('uses the B2C endpoint when asked', async () => {
    const { service, api } = setup();
    await service.upload(1, { ...input, b2c: true });
    expect(api.request).toHaveBeenCalledWith(
      expect.objectContaining({ path: '/test/FCTEL/rest/uploadb2c' }),
    );
  });

  it('records a refusal with ANAF’s message and no index', async () => {
    const { service, api, uploads } = setup();
    api.request.mockResolvedValue({ status: 200, data: refused });
    await service.upload(1, input);
    expect(uploads.create).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'rejected',
        uploadIndex: null,
        errorMessage: expect.stringContaining('UBL, CN, CII'),
      }),
    );
  });

  it('records a 400 answer with its message', async () => {
    const { service, api, uploads } = setup();
    api.request.mockResolvedValue({
      status: 400,
      data: { message: 'Parametrul standard este obligatoriu' },
    });
    await service.upload(1, input);
    expect(uploads.create).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'rejected',
        errorMessage: 'Parametrul standard este obligatoriu',
      }),
    );
  });

  it('needs a certificate on the company', async () => {
    const { service, api } = setup({
      company: noCertificate(),
    });
    await expect(service.upload(1, input)).rejects.toThrow(NO_CERTIFICATE);
    expect(api.request).not.toHaveBeenCalled();
  });

  it('refuses an empty or oversized file before calling ANAF', async () => {
    const { service, api } = setup();
    await expect(service.upload(1, { ...input, xml: '  ' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(
      service.upload(1, { ...input, xml: 'x'.repeat(10 * 1024 * 1024 + 1) }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(api.request).not.toHaveBeenCalled();
  });
});

describe('EfacturaService.uploadInvoice', () => {
  it('validates the invoice XML, then uploads it as UBL for the invoice company', async () => {
    const { service, http, api, uploads } = setup();
    await service.uploadInvoice(1, 3);
    expect(http.axiosRef.post).toHaveBeenCalledWith(
      'https://validator.example/prod/FCTEL/rest/validare/FACT1',
      '<Invoice/>',
      expect.any(Object),
    );
    expect(api.request).toHaveBeenCalledOnce();
    expect(uploads.create).toHaveBeenCalledWith(
      expect.objectContaining({ invoiceId: 3, companyId: 7, standard: 'UBL' }),
    );
  });

  it('does not upload an XML that ANAF’s validator rejects, and shows why', async () => {
    const { service, http, api } = setup();
    http.axiosRef.post.mockResolvedValue({
      status: 200,
      data: { stare: 'nok', Messages: [{ message: 'BR-CO-09 …' }] },
    });
    await expect(service.uploadInvoice(1, 3)).rejects.toMatchObject({
      response: { errors: ['BR-CO-09 …'] },
    });
    expect(api.request).not.toHaveBeenCalled();
  });

  it('uploads anyway when the validator cannot be reached', async () => {
    const { service, http, api } = setup();
    http.axiosRef.post.mockRejectedValue(new Error('ECONNRESET'));
    await service.uploadInvoice(1, 3);
    expect(api.request).toHaveBeenCalledOnce();
  });

  it.each(['processing', 'ok'] as const)(
    'refuses an invoice that is already %s at ANAF',
    async (status) => {
      const { service, uploads, api } = setup();
      uploads.findOne.mockResolvedValue(upload({ invoiceId: 3, status }));
      await expect(service.uploadInvoice(1, 3)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(api.request).not.toHaveBeenCalled();
    },
  );
});

describe('EfacturaService.refresh', () => {
  it('asks ANAF for the state with the stored index and environment', async () => {
    const { service, api } = setup();
    api.request.mockResolvedValue({
      status: 200,
      data: stare('stare="ok" id_descarcare="9001"'),
    });
    const refreshed = await service.refresh(1, 5);
    expect(api.request).toHaveBeenCalledWith(
      expect.objectContaining({
        path: '/test/FCTEL/rest/stareMesaj',
        params: { id_incarcare: '3828' },
      }),
    );
    expect(refreshed).toMatchObject({ status: 'ok', downloadId: '9001' });
    expect(refreshed.checkedAt).toBeInstanceOf(Date);
  });

  it('keeps processing while ANAF still works on it', async () => {
    const { service, api } = setup();
    api.request.mockResolvedValue({
      status: 200,
      data: stare('stare="in prelucrare"'),
    });
    expect((await service.refresh(1, 5)).status).toBe('processing');
  });

  it('does not call ANAF again once the state is final', async () => {
    const { service, api, uploads } = setup();
    uploads.findOneBy.mockResolvedValue(upload({ status: 'ok' }));
    expect((await service.refresh(1, 5)).status).toBe('ok');
    expect(api.request).not.toHaveBeenCalled();
  });

  it('shows ANAF’s error and leaves the record alone', async () => {
    const { service, api, uploads } = setup();
    api.request.mockResolvedValue({
      status: 200,
      data: '<header><Errors errorMessage="Nu exista factura cu id_incarcare= 15000"/></header>',
    });
    await expect(service.refresh(1, 5)).rejects.toBeInstanceOf(
      BadGatewayException,
    );
    expect(uploads.save).not.toHaveBeenCalled();
  });

  it('answers 404 for an upload of another accountant', async () => {
    const { service, uploads } = setup();
    uploads.findOneBy.mockResolvedValue(null);
    await expect(service.refresh(1, 99)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

const zip = Buffer.from([0x50, 0x4b, 0x03, 0x04, 1, 2, 3]);

describe('EfacturaService.download', () => {
  it('downloads the zip of the stored download id', async () => {
    const { service, api, uploads } = setup();
    uploads.findOneBy.mockResolvedValue(
      upload({ status: 'ok', downloadId: '9001' }),
    );
    api.request.mockResolvedValue({ status: 200, data: zip });
    const file = await service.download(1, 5);
    expect(api.request).toHaveBeenCalledWith(
      expect.objectContaining({
        path: '/test/FCTEL/rest/descarcare',
        params: { id: '9001' },
        responseType: 'arraybuffer',
      }),
    );
    expect(file).toMatchObject({
      contentType: 'application/zip',
      filename: 'efactura-9001.zip',
    });
  });

  it('says so when there is nothing to download yet', async () => {
    const { service } = setup();
    await expect(service.download(1, 5)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('shows ANAF’s message when it answers with JSON instead of a zip', async () => {
    const { service, api, uploads } = setup();
    uploads.findOneBy.mockResolvedValue(
      upload({ status: 'ok', downloadId: '9001' }),
    );
    api.request.mockResolvedValue({
      status: 200,
      data: Buffer.from(
        '{"eroare":"S-au facut deja 10 descarcari de mesaj in cursul zilei","titlu":"Descarcare mesaj"}',
      ),
    });
    await expect(service.download(1, 5)).rejects.toThrow(
      'S-au facut deja 10 descarcari',
    );
  });
});

describe('EfacturaService.listMessages', () => {
  const body = {
    titlu: 'Lista Mesaje',
    mesaje: [
      {
        data_creare: '202210311452',
        cif: '12345678',
        id_solicitare: '5001120362',
        detalii: 'Erori de validare',
        tip: 'ERORI FACTURA',
        id: '3001474425',
      },
    ],
  };

  it('lists the last days for the company CUI', async () => {
    const { service, api } = setup();
    api.request.mockResolvedValue({ status: 200, data: body });
    const list = await service.listMessages(1, 7, { filtru: 'E' });
    expect(api.request).toHaveBeenCalledWith(
      expect.objectContaining({
        path: '/test/FCTEL/rest/listaMesajeFactura',
        params: { cif: '12345678', zile: 30, filtru: 'E' },
      }),
    );
    expect(list.messages[0]).toEqual({
      id: '3001474425',
      requestId: '5001120362',
      type: 'ERORI FACTURA',
      details: 'Erori de validare',
      cif: '12345678',
      createdAt: '2022-10-31T12:52:00.000Z',
      createdAtRaw: '202210311452',
    });
  });

  it('uses the paginated list for an interval', async () => {
    const { service, api } = setup();
    api.request.mockResolvedValue({
      status: 200,
      data: {
        ...body,
        numar_total_inregistrari: 14130,
        numar_total_pagini: 29,
        index_pagina_curenta: 2,
      },
    });
    const list = await service.listMessages(1, 7, {
      startTime: 1000,
      endTime: 2000,
      pagina: 2,
    });
    expect(api.request).toHaveBeenCalledWith(
      expect.objectContaining({
        path: '/test/FCTEL/rest/listaMesajePaginatieFactura',
        params: { cif: '12345678', startTime: 1000, endTime: 2000, pagina: 2 },
      }),
    );
    expect(list).toMatchObject({ total: 14130, pages: 29, page: 2 });
  });

  it('needs endTime together with startTime', async () => {
    const { service } = setup();
    await expect(
      service.listMessages(1, 7, { startTime: 1000 }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('shows the business error ANAF returns with status 200', async () => {
    const { service, api } = setup();
    api.request.mockResolvedValue({
      status: 200,
      data: { eroare: 'CIF introdus= aaa nu este un numar', titlu: 'Lista' },
    });
    await expect(service.listMessages(1, 7, {})).rejects.toThrow(
      'CIF introdus= aaa',
    );
  });

  it('needs a certificate', async () => {
    const { service } = setup({
      company: noCertificate(),
    });
    await expect(service.listMessages(1, 7, {})).rejects.toThrow(
      NO_CERTIFICATE,
    );
  });
});

describe('EfacturaService.downloadMessage', () => {
  it('downloads by the message id with the company certificate', async () => {
    const { service, api } = setup();
    api.request.mockResolvedValue({ status: 200, data: zip });
    const file = await service.downloadMessage(1, 7, '3001474425');
    expect(api.request).toHaveBeenCalledWith(
      expect.objectContaining({
        connectionId: CONNECTION,
        params: { id: '3001474425' },
      }),
    );
    expect(file.filename).toBe('efactura-3001474425.zip');
  });
});

describe('EfacturaService.validate', () => {
  it('returns valid with the trace id', async () => {
    const { service, http, apiLogs } = setup();
    expect(await service.validate(1, '<Invoice/>')).toEqual({
      valid: true,
      messages: [],
      traceId: 't-1',
    });
    expect(http.axiosRef.post).toHaveBeenCalledWith(
      'https://validator.example/prod/FCTEL/rest/validare/FACT1',
      '<Invoice/>',
      expect.objectContaining({
        headers: { 'Content-Type': 'text/plain' },
      }),
    );
    expect(apiLogs.record).toHaveBeenCalledWith(
      expect.objectContaining({
        accountantId: 1,
        service: 'EFACTURA',
        endpoint: '/validare/FACT1',
        statusCode: 200,
      }),
    );
  });

  it('returns the schematron messages when invalid', async () => {
    const { service, http } = setup();
    http.axiosRef.post.mockResolvedValue({
      status: 200,
      data: { stare: 'nok', Messages: [{ message: 'E: BR-RO-110' }, {}] },
    });
    expect(await service.validate(1, '<Invoice/>', 'FCN')).toMatchObject({
      valid: false,
      messages: ['E: BR-RO-110'],
    });
  });

  it('answers 502 when the validator is unreachable or answers nonsense', async () => {
    const { service, http } = setup();
    http.axiosRef.post.mockRejectedValue(new Error('timeout'));
    await expect(service.validate(1, '<a/>')).rejects.toBeInstanceOf(
      BadGatewayException,
    );
    http.axiosRef.post.mockResolvedValue({ status: 500, data: '<html/>' });
    await expect(service.validate(1, '<a/>')).rejects.toBeInstanceOf(
      BadGatewayException,
    );
  });

  it('answers 400 for an unknown standard (404 from ANAF)', async () => {
    const { service, http } = setup();
    http.axiosRef.post.mockResolvedValue({
      status: 404,
      data: { message: 'Standard necunoscut' },
    });
    await expect(service.validate(1, '<a/>')).rejects.toThrow(
      'Standard necunoscut',
    );
  });

  it('validates a stored invoice', async () => {
    const { service, invoices } = setup();
    expect((await service.validateInvoice(1, 3)).valid).toBe(true);
    expect(invoices.downloadXml).toHaveBeenCalledWith(1, 3);
  });
});

describe('EfacturaService.transform', () => {
  const pdf = Buffer.from('%PDF-1.7 …');

  it('returns the PDF', async () => {
    const { service, http } = setup();
    http.axiosRef.post.mockResolvedValue({ status: 200, data: pdf });
    const file = await service.transform(1, '<Invoice/>');
    expect(file.contentType).toBe('application/pdf');
    expect(http.axiosRef.post).toHaveBeenCalledWith(
      'https://validator.example/prod/FCTEL/rest/transformare/FACT1',
      '<Invoice/>',
      expect.objectContaining({ responseType: 'arraybuffer' }),
    );
  });

  it('skips validation with /DA', async () => {
    const { service, http } = setup();
    http.axiosRef.post.mockResolvedValue({ status: 200, data: pdf });
    await service.transform(1, '<Invoice/>', 'FCN', true);
    expect(http.axiosRef.post).toHaveBeenCalledWith(
      'https://validator.example/prod/FCTEL/rest/transformare/FCN/DA',
      '<Invoice/>',
      expect.any(Object),
    );
  });

  it('explains why an invalid XML cannot be transformed', async () => {
    const { service, http } = setup();
    http.axiosRef.post.mockResolvedValue({
      status: 200,
      data: Buffer.from(
        JSON.stringify({ stare: 'nok', Messages: [{ message: 'E: BR-01' }] }),
      ),
    });
    await expect(service.transform(1, '<Invoice/>')).rejects.toMatchObject({
      response: { errors: ['E: BR-01'] },
    });
  });
});

describe('EfacturaService.list', () => {
  it('lists the uploads of the accountant, newest first', async () => {
    const { service, uploads } = setup();
    const page = await service.list(1, {
      companyId: 7,
      page: 2,
      pageSize: 10,
    });
    expect(uploads.findAndCount).toHaveBeenCalledWith({
      where: { accountantId: 1, companyId: 7 },
      order: { id: 'DESC' },
      skip: 10,
      take: 10,
    });
    expect(page).toMatchObject({ total: 1, page: 2, pageSize: 10 });
  });
});
