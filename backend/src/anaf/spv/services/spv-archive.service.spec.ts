import {
  ConflictException,
  HttpException,
  NotFoundException,
} from '@nestjs/common';
import type { Repository } from 'typeorm';
import type { Company } from '../../../companies/company.entity.js';
import {
  MAX_DOWNLOADS_PER_SYNC,
  normalizeCif,
  NOT_STORED,
  SpvArchiveService,
} from './spv-archive.service.js';
import type { SpvFileStore } from './spv-file-store.service.js';
import type { SpvMessage } from '../spv-message.entity.js';
import type { SpvService } from './spv.service.js';

const MSG = {
  id: '100',
  details: 'Recipisa',
  cif: 'RO8000000000',
  createdAt: '20.12.2017 12:00:00',
  requestId: null,
  type: 'RECIPISA',
};

function setup(storeEnabled = false) {
  const listMessages = vi.fn();
  const downloadMessage = vi.fn();
  const insertChain = {
    insert: vi.fn().mockReturnThis(),
    into: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    orIgnore: vi.fn().mockReturnThis(),
    returning: vi.fn().mockReturnThis(),
    execute: vi.fn().mockResolvedValue({ raw: [{ id: 1 }] }),
  };
  const messages = {
    createQueryBuilder: vi.fn().mockReturnValue(insertChain),
    findAndCount: vi.fn().mockResolvedValue([[], 0]),
    findOneBy: vi.fn(),
    update: vi.fn().mockResolvedValue(undefined),
  };
  const companies = {
    find: vi.fn().mockResolvedValue([{ id: 7, cui: '8000000000' }]),
  };
  const store = {
    enabled: storeEnabled,
    pathFor: (a: number, m: string) => `${a}/${m}.pdf`,
    put: vi.fn().mockResolvedValue(undefined),
    get: vi.fn(),
  };
  const service = new SpvArchiveService(
    { listMessages, downloadMessage } as unknown as SpvService,
    messages as unknown as Repository<SpvMessage>,
    companies as unknown as Repository<Company>,
    store as unknown as SpvFileStore,
  );
  return {
    service,
    listMessages,
    downloadMessage,
    messages,
    companies,
    insertChain,
    store,
  };
}

describe('normalizeCif', () => {
  it('strips spaces and the RO prefix', () => {
    expect(normalizeCif(' RO 123 ')).toBe('123');
    expect(normalizeCif(null)).toBeNull();
    expect(normalizeCif('')).toBeNull();
  });
});

describe('SpvArchiveService.sync', () => {
  it('stores new metadata linked to the company and downloads missing PDFs', async () => {
    const { service, listMessages, downloadMessage, messages, insertChain } =
      setup();
    listMessages.mockResolvedValue({ messages: [MSG] });
    messages.findAndCount.mockResolvedValue([
      [{ id: 11, anafMessageId: '100' }],
      1,
    ]);
    downloadMessage.mockResolvedValue({
      content: Buffer.from('%PDF'),
      contentType: 'application/pdf',
      filename: 'mesaj-100.pdf',
    });

    const summary = await service.sync(1, 7, 60);

    expect(listMessages).toHaveBeenCalledWith(1, 7, { zile: 60 });
    const rows = insertChain.values.mock.calls[0][0] as Record<
      string,
      unknown
    >[];
    expect(rows[0]).toMatchObject({
      accountantId: 1,
      anafConnectionId: 7,
      companyId: 7,
      anafMessageId: '100',
      cif: 'RO8000000000',
      anafCreatedAt: new Date('2017-12-20T10:00:00.000Z'),
      anafCreatedRaw: '20.12.2017 12:00:00',
    });
    expect(insertChain.orIgnore).toHaveBeenCalled();
    expect(downloadMessage).toHaveBeenCalledWith(1, 7, '100');
    expect(messages.update).toHaveBeenCalledWith(
      { id: 11 },
      expect.objectContaining({
        anafConnectionId: 7,
        contentType: 'application/pdf',
        sizeBytes: 4,
      }),
    );
    expect(summary).toEqual({
      fetched: 1,
      added: 1,
      downloaded: 1,
      failed: 0,
      pending: 0,
    });
  });

  it('only downloads what is missing and caps one run', async () => {
    const { service, listMessages, messages } = setup();
    listMessages.mockResolvedValue({ messages: [MSG] });
    await service.sync(1, 7);
    expect(messages.findAndCount.mock.calls[0][0]).toMatchObject({
      take: MAX_DOWNLOADS_PER_SYNC,
    });
  });

  it('counts a failed download and keeps going', async () => {
    const { service, listMessages, downloadMessage, messages } = setup();
    listMessages.mockResolvedValue({ messages: [MSG, { ...MSG, id: '101' }] });
    messages.findAndCount.mockResolvedValue([
      [
        { id: 11, anafMessageId: '100' },
        { id: 12, anafMessageId: '101' },
      ],
      2,
    ]);
    downloadMessage
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce({
        content: Buffer.from('x'),
        contentType: 'application/pdf',
        filename: 'f',
      });
    await expect(service.sync(1, 7)).resolves.toMatchObject({
      downloaded: 1,
      failed: 1,
      pending: 1,
    });
  });

  it('stops downloading when ANAF rate limits', async () => {
    const { service, listMessages, downloadMessage, messages } = setup();
    listMessages.mockResolvedValue({ messages: [MSG] });
    messages.findAndCount.mockResolvedValue([
      [
        { id: 11, anafMessageId: '100' },
        { id: 12, anafMessageId: '101' },
      ],
      2,
    ]);
    downloadMessage.mockRejectedValue(new HttpException('slow down', 429));
    const summary = await service.sync(1, 7);
    expect(downloadMessage).toHaveBeenCalledTimes(1);
    expect(summary.failed).toBe(1);
  });

  it('does nothing else when ANAF has no messages', async () => {
    const { service, listMessages, messages, insertChain } = setup();
    listMessages.mockResolvedValue({ messages: [] });
    await expect(service.sync(1, 7)).resolves.toEqual({
      fetched: 0,
      added: 0,
      downloaded: 0,
      failed: 0,
      pending: 0,
    });
    expect(insertChain.execute).not.toHaveBeenCalled();
    expect(messages.findAndCount).not.toHaveBeenCalled();
  });

  it('propagates an ANAF listing error', async () => {
    const { service, listMessages } = setup();
    listMessages.mockRejectedValue(new Error('ANAF down'));
    await expect(service.sync(1, 7)).rejects.toThrow('ANAF down');
  });
});

describe('SpvArchiveService.list', () => {
  it('filters by accountant and maps rows without content', async () => {
    const { service, messages } = setup();
    const qb = {
      where: vi.fn().mockReturnThis(),
      andWhere: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      addOrderBy: vi.fn().mockReturnThis(),
      skip: vi.fn().mockReturnThis(),
      take: vi.fn().mockReturnThis(),
      getManyAndCount: vi.fn().mockResolvedValue([
        [
          {
            id: 1,
            anafMessageId: '100',
            cif: '8000000000',
            type: 'RECIPISA',
            details: null,
            requestId: null,
            anafCreatedAt: new Date('2017-12-20T10:00:00Z'),
            anafCreatedRaw: '20.12.2017 12:00:00',
            companyId: 7,
            sizeBytes: 4,
            downloadedAt: null,
          },
        ],
        41,
      ]),
    };
    messages.createQueryBuilder.mockReturnValue(qb);

    const page = await service.list(1, {
      cif: '8000000000',
      page: 2,
      pageSize: 20,
    });

    expect(qb.where).toHaveBeenCalledWith('m.accountantId = :accountantId', {
      accountantId: 1,
    });
    expect(qb.andWhere).toHaveBeenCalledWith('m.cif = :cif', {
      cif: '8000000000',
    });
    expect(qb.skip).toHaveBeenCalledWith(20);
    expect(qb.take).toHaveBeenCalledWith(20);
    expect(page.total).toBe(41);
    expect(page.items[0]).toMatchObject({
      id: 1,
      stored: true,
      createdAt: '2017-12-20T10:00:00.000Z',
    });
    expect(page.items[0]).not.toHaveProperty('content');
  });
});

describe('SpvArchiveService.download', () => {
  function withMessage(found: unknown) {
    const ctx = setup();
    ctx.messages.createQueryBuilder.mockReturnValue({
      addSelect: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      getOne: vi.fn().mockResolvedValue(found),
    });
    return ctx;
  }

  it('serves the stored copy without calling ANAF', async () => {
    const { service, downloadMessage } = withMessage({
      id: 1,
      anafMessageId: '100',
      content: Buffer.from('%PDF'),
      contentType: 'application/pdf',
    });
    const doc = await service.download(1, 1);
    expect(doc.filename).toBe('mesaj-100.pdf');
    expect(doc.content.toString()).toBe('%PDF');
    expect(downloadMessage).not.toHaveBeenCalled();
  });

  it('asks for the PDF from ANAF instead of calling SPVWS2 when the copy is missing', async () => {
    const { service, downloadMessage } = withMessage({
      id: 1,
      anafMessageId: '100',
      anafConnectionId: 7,
      content: null,
      storagePath: null,
    });
    await expect(service.download(1, 1)).rejects.toEqual(
      new ConflictException(NOT_STORED),
    );
    expect(downloadMessage).not.toHaveBeenCalled();
  });

  it('returns 404 for another accountant’s or unknown message', async () => {
    const { service } = withMessage(null);
    await expect(service.download(1, 99)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('returns 409 when the copy is missing and the certificate is gone', async () => {
    const { service } = withMessage({
      id: 1,
      anafMessageId: '100',
      anafConnectionId: null,
      content: null,
    });
    await expect(service.download(1, 1)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
});

describe('SpvArchiveService.importMessages', () => {
  const anafList = (mesaje: unknown[]) =>
    Buffer.from(
      JSON.stringify({
        titlu: 'Lista Mesaje disponibile din ultimele 50 zile',
        mesaje,
        cnp: '1111111111118',
        cui: '8000000000,38745062,1111111111118',
        serial: 'ABC',
      }),
    );

  it('saves the messages from the ANAF list without a certificate and links them to companies', async () => {
    const { service, insertChain, companies, listMessages } = setup();
    insertChain.execute.mockResolvedValue({ raw: [{ id: 1 }] });
    const summary = await service.importMessages(
      1,
      anafList([
        {
          id: '929663619',
          detalii: 'Document Fisa Rol pentru CIF=8000000000',
          cif: '8000000000',
          data_creare: '18.09.2026 08:16:32',
          id_solicitare: '193229752',
          tip: 'RASPUNS SOLICITARE',
        },
        {
          id: '930396467',
          detalii: 'Instiintare',
          cif: '38745062',
          data_creare: '22.09.2026 10:38:14',
          id_solicitare: null,
          tip: 'NOTIFICARE',
        },
      ]),
    );

    expect(summary).toEqual({
      fetched: 2,
      added: 1,
      title: 'Lista Mesaje disponibile din ultimele 50 zile',
      certSerial: 'ABC',
      notice: null,
      rights: 3,
      unknownCuis: ['38745062'],
    });
    expect(listMessages).not.toHaveBeenCalled();
    expect(companies.find).toHaveBeenLastCalledWith({
      select: { cui: true },
      where: { accountantId: 1, cui: expect.anything() },
    });
    const rows = insertChain.values.mock.calls[0][0] as Record<
      string,
      unknown
    >[];
    expect(rows[0]).toMatchObject({
      accountantId: 1,
      anafConnectionId: null,
      companyId: 7,
      anafMessageId: '929663619',
      requestId: '193229752',
      type: 'RASPUNS SOLICITARE',
      anafCreatedRaw: '18.09.2026 08:16:32',
    });
    expect(rows[1]).toMatchObject({ companyId: null, requestId: null });
    expect(insertChain.orIgnore).toHaveBeenCalled();
  });

  it('accepts an empty ANAF answer', async () => {
    const { service, insertChain } = setup();
    await expect(
      service.importMessages(
        1,
        Buffer.from(
          '{"titlu":"Lista Mesaje","eroare":"Nu exista mesaje in ultimele 5 zile"}',
        ),
      ),
    ).resolves.toEqual({
      fetched: 0,
      added: 0,
      title: 'Lista Mesaje',
      certSerial: null,
      notice: 'Nu exista mesaje in ultimele 5 zile',
      rights: 0,
      unknownCuis: [],
    });
    expect(insertChain.execute).not.toHaveBeenCalled();
  });

  it('lists the CUIs of the certificate that are not companies yet, without CNPs', async () => {
    const { service, companies } = setup();
    companies.find.mockResolvedValue([{ id: 7, cui: '8000000000' }]);
    const summary = await service.importMessages(
      1,
      Buffer.from(
        JSON.stringify({
          eroare: 'Nu exista mesaje in ultimele 5 zile',
          cui: '8000000000, 38745062,1111111111118,38745062,RO123,',
        }),
      ),
    );
    expect(summary.rights).toBe(3);
    expect(summary.unknownCuis).toEqual(['38745062']);
    expect(companies.find).toHaveBeenCalledTimes(1);
  });
});

describe('SpvArchiveService.saveDocument', () => {
  const pdf = Buffer.from('%PDF-1.4 test');

  it('stores the uploaded PDF on the message and keeps its certificate', async () => {
    const { service, messages } = setup();
    messages.findOneBy
      .mockResolvedValueOnce({
        id: 3,
        accountantId: 1,
        anafMessageId: '929663619',
        anafConnectionId: null,
      })
      .mockResolvedValueOnce({
        id: 3,
        accountantId: 1,
        anafMessageId: '929663619',
        anafConnectionId: null,
        sizeBytes: pdf.length,
        anafCreatedAt: null,
        downloadedAt: new Date('2026-10-17T10:00:00Z'),
      });

    const saved = await service.saveDocument(1, 3, pdf);

    expect(messages.findOneBy).toHaveBeenCalledWith({ id: 3, accountantId: 1 });
    expect(messages.update).toHaveBeenCalledWith(
      { id: 3 },
      expect.objectContaining({
        anafConnectionId: null,
        content: pdf,
        contentType: 'application/pdf',
        sizeBytes: pdf.length,
      }),
    );
    expect(saved).toMatchObject({ id: 3, stored: true });
  });

  it('refuses a file that is not a PDF before touching the database', async () => {
    const { service, messages } = setup();
    await expect(
      service.saveDocument(1, 3, Buffer.from('<html>')),
    ).rejects.toThrow('Fișierul nu este un PDF.');
    expect(messages.findOneBy).not.toHaveBeenCalled();
  });

  it('returns 404 for another accountant’s message', async () => {
    const { service, messages } = setup();
    messages.findOneBy.mockResolvedValue(null);
    await expect(service.saveDocument(1, 99, pdf)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(messages.update).not.toHaveBeenCalled();
  });
});

describe('SpvArchiveService with Supabase Storage', () => {
  const doc = {
    content: Buffer.from('%PDF'),
    contentType: 'application/pdf',
    filename: 'mesaj-100.pdf',
  };

  it('uploads new PDFs and keeps only the path in the database', async () => {
    const { service, listMessages, downloadMessage, messages, store } =
      setup(true);
    listMessages.mockResolvedValue({ messages: [MSG] });
    messages.findAndCount.mockResolvedValue([
      [{ id: 11, anafMessageId: '100' }],
      1,
    ]);
    downloadMessage.mockResolvedValue(doc);

    await service.sync(1, 7);

    expect(store.put).toHaveBeenCalledWith(
      '1/100.pdf',
      doc.content,
      'application/pdf',
    );
    expect(messages.update).toHaveBeenCalledWith(
      { id: 11 },
      expect.objectContaining({
        storagePath: '1/100.pdf',
        content: null,
        sizeBytes: 4,
      }),
    );
  });

  it('does not count a document as saved when the upload fails', async () => {
    const { service, listMessages, downloadMessage, messages, store } =
      setup(true);
    listMessages.mockResolvedValue({ messages: [MSG] });
    messages.findAndCount.mockResolvedValue([
      [{ id: 11, anafMessageId: '100' }],
      1,
    ]);
    downloadMessage.mockResolvedValue(doc);
    store.put.mockRejectedValue(new Error('storage down'));

    const summary = await service.sync(1, 7);

    expect(summary).toMatchObject({ downloaded: 0, failed: 1, pending: 1 });
    expect(messages.update).not.toHaveBeenCalled();
  });

  it('serves a PDF from storage', async () => {
    const { service, messages, store, downloadMessage } = setup(true);
    messages.createQueryBuilder.mockReturnValue({
      addSelect: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      getOne: vi.fn().mockResolvedValue({
        id: 1,
        anafMessageId: '100',
        content: null,
        storagePath: '1/100.pdf',
        contentType: 'application/pdf',
      }),
    });
    store.get.mockResolvedValue(Buffer.from('from-storage'));

    const result = await service.download(1, 1);

    expect(store.get).toHaveBeenCalledWith('1/100.pdf');
    expect(result.content.toString()).toBe('from-storage');
    expect(downloadMessage).not.toHaveBeenCalled();
  });

  it('refuses a stored path when storage is switched off', async () => {
    const { service, messages } = setup(false);
    messages.createQueryBuilder.mockReturnValue({
      addSelect: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      getOne: vi.fn().mockResolvedValue({
        id: 1,
        anafMessageId: '100',
        content: null,
        storagePath: '1/100.pdf',
      }),
    });
    await expect(service.download(1, 1)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('keeps PDFs in the database when storage is off', async () => {
    const { service, listMessages, downloadMessage, messages, store } = setup();
    listMessages.mockResolvedValue({ messages: [MSG] });
    messages.findAndCount.mockResolvedValue([
      [{ id: 11, anafMessageId: '100' }],
      1,
    ]);
    downloadMessage.mockResolvedValue(doc);
    await service.sync(1, 7);
    expect(store.put).not.toHaveBeenCalled();
    expect(messages.update).toHaveBeenCalledWith(
      { id: 11 },
      expect.objectContaining({ storagePath: null, content: doc.content }),
    );
  });
});

describe('SpvArchiveService.moveStoredContent', () => {
  function withRows(storeEnabled: boolean, rows: unknown[]) {
    const ctx = setup(storeEnabled);
    const qb = {
      addSelect: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      take: vi.fn().mockReturnThis(),
      getMany: vi.fn().mockResolvedValue(rows),
    };
    ctx.messages.createQueryBuilder.mockReturnValue(qb);
    return { ...ctx, qb };
  }

  it('does nothing when storage is off', async () => {
    const { service, qb } = withRows(false, []);
    await expect(service.moveStoredContent()).resolves.toBe(0);
    expect(qb.getMany).not.toHaveBeenCalled();
  });

  it('uploads database PDFs and clears the content column', async () => {
    const { service, store, messages } = withRows(true, [
      {
        id: 1,
        accountantId: 2,
        anafMessageId: '100',
        content: Buffer.from('a'),
        contentType: null,
      },
    ]);
    await expect(service.moveStoredContent()).resolves.toBe(1);
    expect(store.put).toHaveBeenCalledWith(
      '2/100.pdf',
      Buffer.from('a'),
      'application/pdf',
    );
    expect(messages.update).toHaveBeenCalledWith(
      { id: 1 },
      { storagePath: '2/100.pdf', content: null },
    );
  });

  it('stops at the first failure and leaves that row in the database', async () => {
    const { service, store, messages } = withRows(true, [
      {
        id: 1,
        accountantId: 2,
        anafMessageId: '100',
        content: Buffer.from('a'),
      },
      {
        id: 2,
        accountantId: 2,
        anafMessageId: '101',
        content: Buffer.from('b'),
      },
    ]);
    store.put.mockRejectedValue(new Error('down'));
    await expect(service.moveStoredContent()).resolves.toBe(0);
    expect(store.put).toHaveBeenCalledTimes(1);
    expect(messages.update).not.toHaveBeenCalled();
  });
});
