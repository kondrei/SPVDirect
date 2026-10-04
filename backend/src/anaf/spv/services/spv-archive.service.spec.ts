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

    const summary = await service.sync(1, 'conn', 60);

    expect(listMessages).toHaveBeenCalledWith(1, 'conn', { zile: 60 });
    const rows = insertChain.values.mock.calls[0][0] as Record<
      string,
      unknown
    >[];
    expect(rows[0]).toMatchObject({
      accountantId: 1,
      anafConnectionId: 'conn',
      companyId: 7,
      anafMessageId: '100',
      cif: 'RO8000000000',
      anafCreatedAt: new Date('2017-12-20T10:00:00.000Z'),
      anafCreatedRaw: '20.12.2017 12:00:00',
    });
    expect(insertChain.orIgnore).toHaveBeenCalled();
    expect(downloadMessage).toHaveBeenCalledWith(1, 'conn', '100');
    expect(messages.update).toHaveBeenCalledWith(
      { id: 11 },
      expect.objectContaining({
        anafConnectionId: 'conn',
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
    await service.sync(1, 'conn');
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
    await expect(service.sync(1, 'conn')).resolves.toMatchObject({
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
    const summary = await service.sync(1, 'conn');
    expect(downloadMessage).toHaveBeenCalledTimes(1);
    expect(summary.failed).toBe(1);
  });

  it('does nothing else when ANAF has no messages', async () => {
    const { service, listMessages, messages, insertChain } = setup();
    listMessages.mockResolvedValue({ messages: [] });
    await expect(service.sync(1, 'conn')).resolves.toEqual({
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
    await expect(service.sync(1, 'conn')).rejects.toThrow('ANAF down');
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

  it('fetches and stores a missing copy', async () => {
    const { service, downloadMessage, messages } = withMessage({
      id: 1,
      anafMessageId: '100',
      anafConnectionId: 'conn',
      content: null,
    });
    const fetched = {
      content: Buffer.from('abc'),
      contentType: 'application/pdf',
      filename: 'mesaj-100.pdf',
    };
    downloadMessage.mockResolvedValue(fetched);
    await expect(service.download(1, 1)).resolves.toBe(fetched);
    expect(messages.update).toHaveBeenCalledWith(
      { id: 1 },
      expect.objectContaining({ sizeBytes: 3 }),
    );
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

    await service.sync(1, 'conn');

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

    const summary = await service.sync(1, 'conn');

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
    await service.sync(1, 'conn');
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
