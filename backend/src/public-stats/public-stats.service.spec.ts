import type { Repository } from 'typeorm';
import { AccountantRepository } from '../accountants/repositories/accountant.repository.js';
import { AnafConnectionRepository } from '../anaf/repositories/anaf-connection.repository.js';
import { SpvMessageRepository } from '../anaf/spv/repositories/spv-message.repository.js';
import { CompanyRepository } from '../companies/repositories/company.repository.js';
import { EfacturaUploadRepository } from '../efactura/repositories/efactura-upload.repository.js';
import { InvoiceRepository } from '../invoices/repositories/invoice.repository.js';
import {
  PUBLIC_STATS_TTL_MS,
  PublicStatsService,
} from './public-stats.service.js';

function repo(count: number) {
  return {
    count: vi.fn().mockResolvedValue(count),
    countBy: vi.fn().mockResolvedValue(count),
  };
}

function setup() {
  const repos = {
    accountants: repo(3),
    companies: repo(40),
    invoices: repo(500),
    uploads: repo(120),
    spvMessages: repo(900),
    connections: repo(12),
  };
  const r = (x: object) => x as unknown as Repository<never>;
  const service = new PublicStatsService(
    new AccountantRepository(r(repos.accountants)),
    new CompanyRepository(r(repos.companies)),
    new InvoiceRepository(r(repos.invoices)),
    new EfacturaUploadRepository(r(repos.uploads)),
    new SpvMessageRepository(r(repos.spvMessages)),
    new AnafConnectionRepository(r(repos.connections)),
  );
  return { service, repos };
}

describe('PublicStatsService', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns aggregate counts only', async () => {
    const { service, repos } = setup();
    const stats = await service.getStats();
    expect(stats).toEqual({
      accountants: 3,
      companies: 40,
      invoices: 500,
      efacturaUploads: 120,
      spvMessages: 900,
      anafConnections: 12,
      updatedAt: expect.any(String),
    });
    expect(repos.accountants.countBy).toHaveBeenCalledWith({
      status: 'active',
    });
    expect(repos.uploads.countBy).toHaveBeenCalledWith({ status: 'ok' });
  });

  it('serves the cached numbers until the TTL expires', async () => {
    vi.useFakeTimers();
    const { service, repos } = setup();
    await service.getStats();
    vi.advanceTimersByTime(PUBLIC_STATS_TTL_MS - 1);
    await service.getStats();
    expect(repos.companies.count).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(2);
    await service.getStats();
    expect(repos.companies.count).toHaveBeenCalledTimes(2);
  });

  it('reloads the numbers after an invalidation', async () => {
    const { service, repos } = setup();
    await service.getStats();
    repos.invoices.count.mockResolvedValue(501);
    service.invalidate();
    await expect(service.getStats()).resolves.toMatchObject({ invoices: 501 });
    expect(repos.invoices.count).toHaveBeenCalledTimes(2);
  });

  it('does not cache a load that started before the invalidation', async () => {
    const { service, repos } = setup();
    let release!: (n: number) => void;
    repos.invoices.count.mockReturnValueOnce(
      new Promise<number>((resolve) => {
        release = resolve;
      }),
    );
    const before = service.getStats();
    service.invalidate();
    repos.invoices.count.mockResolvedValue(501);
    const after = service.getStats();
    release(500);
    await expect(before).resolves.toMatchObject({ invoices: 500 });
    await expect(after).resolves.toMatchObject({ invoices: 501 });
    await expect(service.getStats()).resolves.toMatchObject({ invoices: 501 });
    expect(repos.invoices.count).toHaveBeenCalledTimes(2);
  });

  it('serves stale numbers when the reload after an invalidation fails', async () => {
    const { service, repos } = setup();
    const first = await service.getStats();
    service.invalidate();
    repos.invoices.count.mockRejectedValueOnce(new Error('db down'));
    await expect(service.getStats()).resolves.toBe(first);
  });

  it('runs a single query batch for concurrent requests', async () => {
    const { service, repos } = setup();
    await Promise.all([
      service.getStats(),
      service.getStats(),
      service.getStats(),
    ]);
    expect(repos.companies.count).toHaveBeenCalledOnce();
  });

  it('serves stale numbers when the database fails after expiry', async () => {
    vi.useFakeTimers();
    const { service, repos } = setup();
    const first = await service.getStats();
    vi.advanceTimersByTime(PUBLIC_STATS_TTL_MS + 1);
    repos.invoices.count.mockRejectedValueOnce(new Error('db down'));
    await expect(service.getStats()).resolves.toBe(first);
  });

  it('fails when the database is down and nothing is cached', async () => {
    const { service, repos } = setup();
    repos.invoices.count.mockRejectedValueOnce(new Error('db down'));
    await expect(service.getStats()).rejects.toThrow('db down');
    await expect(service.getStats()).resolves.toMatchObject({ invoices: 500 });
  });
});
