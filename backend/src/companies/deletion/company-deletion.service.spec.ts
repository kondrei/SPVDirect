import { ConflictException, NotFoundException } from '@nestjs/common';
import { In, IsNull, Not, type DataSource } from 'typeorm';
import { AuthorizationLink } from '../../anaf/authorization-links/authorization-link.entity.js';
import type { AnafConnectionsService } from '../../anaf/services/anaf-connections.service.js';
import type { SpvFileStore } from '../../anaf/spv/services/spv-file-store.service.js';
import { SpvMessage } from '../../anaf/spv/spv-message.entity.js';
import { EfacturaInvoice } from '../../efactura/efactura-invoice.entity.js';
import { EfacturaUpload } from '../../efactura/efactura-upload.entity.js';
import type { EfacturaFileStore } from '../../efactura/services/efactura-file-store.service.js';
import { Invoice } from '../../invoices/invoice.entity.js';
import type { InvoiceFileStore } from '../../invoices/services/invoice-file-store.service.js';
import { Accountant } from '../../accountants/accountant.entity.js';
import { ApiLog } from '../../api-logs/api-log.entity.js';
import {
  ActivityAction,
  ApiLogService,
} from '../../api-logs/dto/api-log.enums.js';
import { Company } from '../company.entity.js';
import type { CompaniesService } from '../services/companies.service.js';
import {
  CompanyDeletionService,
  UPLOAD_IN_PROGRESS,
} from './company-deletion.service.js';
import type { ActivityLogsService } from '../../api-logs/activity-logs.service.js';
import { fakeActivityLogs } from '../../testing/activity-logs.js';

const COMPANY = { id: 7, accountantId: 1, cui: '123' } as Company;

function setup({
  sending = false,
  locked = true,
  unlinked = [] as { id: number }[],
  stored = {} as Partial<
    Record<'invoices' | 'messages' | 'live' | 'archived', unknown[]>
  >,
} = {}) {
  const calls: [string, unknown, ...unknown[]][] = [];
  const builder = {
    where: vi.fn().mockReturnThis(),
    andWhere: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    getRawMany: vi.fn().mockResolvedValue(unlinked),
  };
  const manager = {
    find: vi.fn().mockResolvedValue(locked ? [{ id: 7 }] : []),
    existsBy: vi.fn().mockResolvedValue(sending),
    getRepository: vi.fn(() => ({
      createQueryBuilder: vi.fn().mockReturnValue(builder),
    })),
    update: vi.fn((target: unknown, ...args: unknown[]) => {
      calls.push(['update', target, ...args]);
      return Promise.resolve({});
    }),
    softDelete: vi.fn((target: unknown, ...args: unknown[]) => {
      calls.push(['softDelete', target, ...args]);
      return Promise.resolve({});
    }),
    delete: vi.fn((target: unknown, ...args: unknown[]) => {
      calls.push(['delete', target, ...args]);
      return Promise.resolve({});
    }),
  };
  const repositories = new Map<unknown, { find: ReturnType<typeof vi.fn> }>([
    [Invoice, { find: vi.fn().mockResolvedValue(stored.invoices ?? []) }],
    [
      EfacturaInvoice,
      { find: vi.fn().mockResolvedValue(stored.archived ?? []) },
    ],
    [
      SpvMessage,
      {
        find: vi.fn((options: { withDeleted?: boolean }) =>
          Promise.resolve(
            options.withDeleted ? (stored.messages ?? []) : (stored.live ?? []),
          ),
        ),
      },
    ],
  ]);
  const dataSource = {
    transaction: vi.fn((work: (m: typeof manager) => Promise<unknown>) =>
      work(manager),
    ),
    getRepository: vi.fn((target: unknown) => repositories.get(target)),
  };
  const companies = {
    get: vi.fn().mockResolvedValue(COMPANY),
  };
  const invoiceFiles = { remove: vi.fn().mockResolvedValue(undefined) };
  const spvFiles = { remove: vi.fn().mockResolvedValue(undefined) };
  const efacturaFiles = { remove: vi.fn().mockResolvedValue(undefined) };
  const connections = { removeAll: vi.fn().mockResolvedValue([]) };
  const activity = fakeActivityLogs();
  const service = new CompanyDeletionService(
    dataSource as unknown as DataSource,
    companies as unknown as CompaniesService,
    invoiceFiles as unknown as InvoiceFileStore,
    spvFiles as unknown as SpvFileStore,
    efacturaFiles as unknown as EfacturaFileStore,
    connections as unknown as AnafConnectionsService,
    activity as unknown as ActivityLogsService,
  );
  return {
    activity,
    service,
    calls,
    manager,
    builder,
    dataSource,
    companies,
    invoiceFiles,
    spvFiles,
    efacturaFiles,
    connections,
    repositories,
  };
}

describe('CompanyDeletionService.softDelete', () => {
  it('marks the company and everything that belongs to it as deleted in one transaction', async () => {
    const { service, calls, dataSource } = setup();
    await service.softDelete(1, 7);
    expect(dataSource.transaction).toHaveBeenCalledOnce();
    expect(calls).toEqual([
      ['softDelete', Invoice, { companyId: 7 }],
      ['softDelete', EfacturaUpload, { companyId: 7 }],
      ['softDelete', EfacturaInvoice, { companyId: 7 }],
      ['softDelete', SpvMessage, { companyId: 7 }],
      ['delete', AuthorizationLink, { companyId: 7, usedAt: IsNull() }],
      ['softDelete', Company, { id: 7 }],
    ]);
  });

  it('first attaches SPV messages that only match the company by CIF', async () => {
    const { service, calls, builder } = setup({
      unlinked: [{ id: 30 }, { id: 31 }],
    });
    await service.softDelete(1, 7);
    expect(builder.andWhere).toHaveBeenCalledWith('m.companyId IS NULL');
    expect(calls[0]).toEqual([
      'update',
      SpvMessage,
      { id: In([30, 31]) },
      { companyId: 7 },
    ]);
    expect(calls[4]).toEqual(['softDelete', SpvMessage, { companyId: 7 }]);
  });

  it('refuses while an invoice of the company is being sent to ANAF', async () => {
    const { service, calls, manager } = setup({ sending: true });
    const err = await service.softDelete(1, 7).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ConflictException);
    expect((err as Error).message).toBe(UPLOAD_IN_PROGRESS);
    expect(manager.existsBy).toHaveBeenCalledWith(EfacturaUpload, {
      companyId: 7,
      status: 'sending',
    });
    expect(calls).toEqual([]);
  });

  it('locks the company row before checking for uploads in progress', async () => {
    const { service, manager } = setup();
    await service.softDelete(1, 7);
    expect(manager.find).toHaveBeenCalledWith(
      Company,
      expect.objectContaining({
        where: { accountantId: 1, id: 7 },
        lock: { mode: 'pessimistic_write' },
      }),
    );
    expect(manager.find.mock.invocationCallOrder[0]).toBeLessThan(
      manager.existsBy.mock.invocationCallOrder[0],
    );
  });

  it('answers 404 when the company was deleted while waiting for the lock', async () => {
    const { service, calls } = setup({ locked: false });
    await expect(service.softDelete(1, 7)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(calls).toEqual([]);
  });

  it('answers 404 for a company that is missing or already deleted', async () => {
    const { service, companies, dataSource } = setup();
    companies.get.mockRejectedValue(new NotFoundException());
    await expect(service.softDelete(1, 7)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });
});

describe('CompanyDeletionService.softDelete activity', () => {
  it('logs the deletion with the company name and CUI after the transaction', async () => {
    const { service, activity, dataSource } = setup();
    await service.softDelete(1, 7);
    expect(dataSource.transaction).toHaveBeenCalledOnce();
    expect(activity.record).toHaveBeenCalledWith(
      1,
      expect.objectContaining({
        action: ActivityAction.CompanyDeleted,
        companyId: 7,
      }),
    );
  });

  it('logs nothing when the deletion is refused', async () => {
    const { service, activity, dataSource } = setup();
    dataSource.transaction.mockRejectedValueOnce(new Error('409'));
    await expect(service.softDelete(1, 7)).rejects.toThrow('409');
    expect(activity.record).not.toHaveBeenCalled();
  });
});

describe('CompanyDeletionService.purge', () => {
  it('removes stored files, then deletes rows children first', async () => {
    const { service, calls, invoiceFiles, spvFiles } = setup({
      stored: {
        invoices: [{ id: 1, storagePath: '1/7/A-000001.pdf' }],
        messages: [{ id: 2, storagePath: '1/900.pdf' }],
      },
    });
    await service.purge(7);
    expect(invoiceFiles.remove).toHaveBeenCalledWith(['1/7/A-000001.pdf']);
    expect(spvFiles.remove).toHaveBeenCalledWith(['1/900.pdf']);
    expect(calls).toEqual([
      ['delete', EfacturaInvoice, { companyId: 7 }],
      ['delete', EfacturaUpload, { companyId: 7 }],
      ['delete', Invoice, { companyId: 7, stornoOfInvoiceId: Not(IsNull()) }],
      ['delete', Invoice, { companyId: 7 }],
      ['delete', SpvMessage, { companyId: 7 }],
      [
        'delete',
        ApiLog,
        {
          companyId: 7,
          service: In([ApiLogService.Activity, ApiLogService.Smtp]),
        },
      ],
      ['delete', Company, { id: 7 }],
    ]);
  });

  it('removes the stored ZIPs and PDFs of the e-Factura archive', async () => {
    const { service, efacturaFiles, repositories } = setup({
      stored: {
        archived: [
          {
            id: 4,
            zipStoragePath: '1/7/prod/55.zip',
            pdfStoragePath: '1/7/prod/55.pdf',
          },
          { id: 5, zipStoragePath: null, pdfStoragePath: null },
        ],
      },
    });
    await service.purge(7);
    expect(repositories.get(EfacturaInvoice)?.find).toHaveBeenCalledWith(
      expect.objectContaining({ where: { companyId: 7 }, withDeleted: true }),
    );
    expect(efacturaFiles.remove).toHaveBeenCalledWith([
      '1/7/prod/55.zip',
      '1/7/prod/55.pdf',
    ]);
  });

  it('includes soft-deleted rows when collecting stored files', async () => {
    const { service, repositories } = setup();
    await service.purge(7);
    expect(repositories.get(Invoice)?.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { companyId: 7, storagePath: Not(IsNull()) },
        withDeleted: true,
      }),
    );
  });

  it('keeps an SPV file that a live message still uses', async () => {
    const { service, spvFiles } = setup({
      stored: {
        messages: [
          { id: 2, storagePath: '1/900.pdf' },
          { id: 3, storagePath: '1/901.pdf' },
        ],
        live: [{ id: 9, storagePath: '1/900.pdf' }],
      },
    });
    await service.purge(7);
    expect(spvFiles.remove).toHaveBeenCalledWith(['1/901.pdf']);
  });

  it('purges an account: each of its companies, its other SPV files, then the account row', async () => {
    const { service, dataSource, spvFiles, repositories, calls, connections } =
      setup({
        stored: { messages: [{ id: 2, storagePath: '1/900.pdf' }] },
      });
    const accountantDelete = vi.fn().mockResolvedValue({});
    repositories.set(Company, {
      find: vi.fn().mockResolvedValue([{ id: 7 }]),
    });
    repositories.set(Accountant, {
      find: vi.fn(),
      delete: accountantDelete,
    } as never);
    await service.purgeAccountant(1);

    expect(repositories.get(Company)?.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { accountantId: 1 },
        withDeleted: true,
      }),
    );
    expect(calls).toContainEqual(['delete', Company, { id: 7 }]);
    expect(repositories.get(SpvMessage)?.find).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { accountantId: 1, storagePath: Not(IsNull()) },
        withDeleted: true,
      }),
    );
    expect(spvFiles.remove).toHaveBeenLastCalledWith(['1/900.pdf']);
    expect(connections.removeAll).toHaveBeenCalledWith(1);
    expect(connections.removeAll.mock.invocationCallOrder[0]).toBeLessThan(
      accountantDelete.mock.invocationCallOrder[0],
    );
    expect(accountantDelete).toHaveBeenCalledWith({ id: 1 });
    expect(dataSource.getRepository).toHaveBeenCalledWith(Accountant);
  });

  it('skips Storage when nothing was stored there', async () => {
    const { service, invoiceFiles, spvFiles, efacturaFiles } = setup();
    await service.purge(7);
    expect(invoiceFiles.remove).not.toHaveBeenCalled();
    expect(spvFiles.remove).not.toHaveBeenCalled();
    expect(efacturaFiles.remove).not.toHaveBeenCalled();
  });

  it('keeps the rows when Storage fails, so the next run retries', async () => {
    const { service, calls, invoiceFiles } = setup({
      stored: { invoices: [{ id: 1, storagePath: '1/7/A-000001.pdf' }] },
    });
    invoiceFiles.remove.mockRejectedValue(new Error('storage down'));
    await expect(service.purge(7)).rejects.toThrow('storage down');
    expect(calls).toEqual([]);
  });
});
