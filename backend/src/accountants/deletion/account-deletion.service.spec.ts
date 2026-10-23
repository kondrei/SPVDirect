import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import type { DataSource } from 'typeorm';
import { AuthorizationLink } from '../../anaf/authorization-links/authorization-link.entity.js';
import type { AnafConnectionsService } from '../../anaf/services/anaf-connections.service.js';
import { SpvMessage } from '../../anaf/spv/spv-message.entity.js';
import { hashPassword } from '../../common/crypto/password.js';
import { Company } from '../../companies/company.entity.js';
import { EfacturaInvoice } from '../../efactura/efactura-invoice.entity.js';
import { EfacturaUpload } from '../../efactura/efactura-upload.entity.js';
import { Invoice } from '../../invoices/invoice.entity.js';
import { Accountant } from '../accountant.entity.js';
import {
  ACCOUNT_UPLOAD_IN_PROGRESS,
  AccountDeletionService,
  WRONG_PASSWORD,
} from './account-deletion.service.js';
import { AuthorizationLinkRepository } from '../../anaf/authorization-links/repositories/authorization-link.repository.js';
import { AccountantMfa } from '../../auth/accountant-mfa.entity.js';
import { AccountantMfaRepository } from '../../auth/repositories/accountant-mfa.repository.js';
import { SpvMessageRepository } from '../../anaf/spv/repositories/spv-message.repository.js';
import { CompanyRepository } from '../../companies/repositories/company.repository.js';
import { EfacturaInvoiceRepository } from '../../efactura/repositories/efactura-invoice.repository.js';
import { EfacturaUploadRepository } from '../../efactura/repositories/efactura-upload.repository.js';
import { InvoiceRepository } from '../../invoices/repositories/invoice.repository.js';
import { AccountantRepository } from '../repositories/accountant.repository.js';

async function setup({ sending = false, found = true } = {}) {
  const passwordHash = await hashPassword('parola-corecta');
  const calls: unknown[][] = [];
  const builder = {
    addSelect: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    getOne: vi.fn().mockResolvedValue(found ? { id: 1, passwordHash } : null),
  };
  const manager = {
    find: vi.fn().mockResolvedValue([{ id: 7 }]),
    existsBy: vi.fn().mockResolvedValue(sending),
    softDelete: vi.fn((target: unknown, criteria: unknown) => {
      calls.push(['softDelete', target, criteria]);
      return Promise.resolve({});
    }),
    delete: vi.fn((target: unknown, criteria: unknown) => {
      calls.push(['delete', target, criteria]);
      return Promise.resolve({});
    }),
    update: vi.fn((target: unknown, criteria: unknown, values: unknown) => {
      calls.push(['update', target, criteria, values]);
      return Promise.resolve({});
    }),
  };
  const accountants = {
    createQueryBuilder: vi.fn().mockReturnValue(builder),
  };
  const dataSource = {
    transaction: vi.fn((work: (m: typeof manager) => Promise<unknown>) =>
      work(manager),
    ),
  };
  const anaf = { removeAll: vi.fn().mockResolvedValue([]) };
  const service = new AccountDeletionService(
    dataSource as unknown as DataSource,
    anaf as unknown as AnafConnectionsService,
    new AccountantRepository(accountants as never),
    new CompanyRepository({} as never),
    new InvoiceRepository({} as never),
    new EfacturaUploadRepository({} as never),
    new EfacturaInvoiceRepository({} as never),
    new SpvMessageRepository({} as never),
    new AuthorizationLinkRepository({} as never),
    new AccountantMfaRepository({} as never),
  );
  return { service, calls, manager, dataSource, anaf };
}

describe('AccountDeletionService.softDelete', () => {
  it('marks the account and all its data as deleted in one transaction', async () => {
    const { service, calls, dataSource } = await setup();
    await service.softDelete(1, 'parola-corecta');
    expect(dataSource.transaction).toHaveBeenCalledOnce();
    expect(calls).toEqual([
      ['softDelete', Invoice, { accountantId: 1 }],
      ['softDelete', EfacturaUpload, { accountantId: 1 }],
      ['softDelete', EfacturaInvoice, { accountantId: 1 }],
      ['softDelete', SpvMessage, { accountantId: 1 }],
      ['softDelete', Company, { accountantId: 1 }],
      ['delete', AuthorizationLink, { accountantId: 1 }],
      ['delete', AccountantMfa, { accountantId: 1 }],
      ['update', Accountant, { id: 1 }, { status: 'deleted' }],
      ['softDelete', Accountant, { id: 1 }],
    ]);
  });

  it('revokes and removes every ANAF certificate after the commit', async () => {
    const { service, anaf, dataSource } = await setup();
    await service.softDelete(1, 'parola-corecta');
    expect(anaf.removeAll).toHaveBeenCalledWith(1);
    expect(dataSource.transaction.mock.invocationCallOrder[0]).toBeLessThan(
      anaf.removeAll.mock.invocationCallOrder[0],
    );
  });

  it('locks every company of the account before checking for uploads', async () => {
    const { service, manager } = await setup();
    await service.softDelete(1, 'parola-corecta');
    expect(manager.find).toHaveBeenCalledWith(
      Company,
      expect.objectContaining({
        where: { accountantId: 1 },
        lock: { mode: 'pessimistic_write' },
      }),
    );
    expect(manager.find.mock.invocationCallOrder[0]).toBeLessThan(
      manager.existsBy.mock.invocationCallOrder[0],
    );
  });

  it('refuses a wrong password and changes nothing', async () => {
    const { service, dataSource, anaf } = await setup();
    const err = await service.softDelete(1, 'alta').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(BadRequestException);
    expect((err as Error).message).toBe(WRONG_PASSWORD);
    expect(dataSource.transaction).not.toHaveBeenCalled();
    expect(anaf.removeAll).not.toHaveBeenCalled();
  });

  it('refuses while an invoice is being sent to ANAF', async () => {
    const { service, calls, anaf, manager } = await setup({ sending: true });
    const err = await service
      .softDelete(1, 'parola-corecta')
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ConflictException);
    expect((err as Error).message).toBe(ACCOUNT_UPLOAD_IN_PROGRESS);
    expect(manager.existsBy).toHaveBeenCalledWith(EfacturaUpload, {
      accountantId: 1,
      status: 'sending',
    });
    expect(calls).toEqual([]);
    expect(anaf.removeAll).not.toHaveBeenCalled();
  });

  it('answers 404 for an account that is gone', async () => {
    const { service } = await setup({ found: false });
    await expect(
      service.softDelete(1, 'parola-corecta'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
