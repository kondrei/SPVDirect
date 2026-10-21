import { ConfigService } from '@nestjs/config';
import { BadRequestException } from '@nestjs/common';
import type { DataSource, Repository } from 'typeorm';
import type { Company } from '../../companies/company.entity.js';
import type { ActivityLogsService } from '../../api-logs/activity-logs.service.js';
import {
  JobActivityAction,
  ScheduledJob,
} from '../../api-logs/dto/api-log.enums.js';
import { EFACTURA_ARCHIVE_SYNC_LOCK_KEY } from '../../common/constants.js';
import { ImportStatus } from '../dto/efactura.enums.js';
import type { EfacturaArchiveService } from '../services/efactura-archive.service.js';
import { EfacturaArchiveSyncJob } from './efactura-archive-sync.job.js';

function imported(count: number, remaining: number) {
  return {
    found: count + remaining,
    remaining,
    results: Array.from({ length: count }, (_, i) => ({
      messageId: String(i),
      status: ImportStatus.Imported,
    })),
  };
}

function setup({ enabled = true, locked = true } = {}) {
  const runner = {
    query: vi.fn((sql: string) =>
      Promise.resolve(sql.includes('try_advisory') ? [{ locked }] : []),
    ),
    release: vi.fn().mockResolvedValue(undefined),
  };
  const dataSource = { createQueryRunner: vi.fn(() => runner) };
  const recordJob = vi.fn().mockResolvedValue(undefined);
  const companies = {
    find: vi
      .fn()
      .mockResolvedValueOnce([
        { id: 7, accountantId: 1 },
        { id: 8, accountantId: 2 },
      ])
      .mockResolvedValue([]),
  };
  const archive = { importPeriod: vi.fn().mockResolvedValue(imported(0, 0)) };
  const job = new EfacturaArchiveSyncJob(
    new ConfigService({ EFACTURA_ARCHIVE_SYNC: enabled }),
    archive as unknown as EfacturaArchiveService,
    companies as unknown as Repository<Company>,
    dataSource as unknown as DataSource,
    { recordJob } as unknown as ActivityLogsService,
  );
  return { job, runner, companies, archive, dataSource, recordJob };
}

describe('EfacturaArchiveSyncJob', () => {
  it('does nothing unless EFACTURA_ARCHIVE_SYNC is on', async () => {
    const { job, dataSource } = setup({ enabled: false });
    await job.run();
    expect(dataSource.createQueryRunner).not.toHaveBeenCalled();
  });

  it('leaves the run to the instance that holds the advisory lock', async () => {
    const { job, archive, runner } = setup({ locked: false });
    await job.run();
    expect(runner.query).toHaveBeenCalledWith(
      'SELECT pg_try_advisory_lock($1) AS locked',
      [EFACTURA_ARCHIVE_SYNC_LOCK_KEY],
    );
    expect(archive.importPeriod).not.toHaveBeenCalled();
    expect(runner.release).toHaveBeenCalled();
  });

  it('imports the last 60 days of every company with a certificate, batch after batch', async () => {
    const { job, archive, runner } = setup();
    archive.importPeriod
      .mockResolvedValueOnce(imported(50, 3))
      .mockResolvedValueOnce(imported(3, 0))
      .mockResolvedValueOnce(imported(0, 0));
    await job.run();
    expect(archive.importPeriod.mock.calls).toEqual([
      [1, 7, 60, true],
      [1, 7, 60, true],
      [2, 8, 60, true],
    ]);
    expect(runner.query).toHaveBeenLastCalledWith(
      'SELECT pg_advisory_unlock($1)',
      [EFACTURA_ARCHIVE_SYNC_LOCK_KEY],
    );
  });

  it('stops a company when a round imports nothing, so failing messages are not retried forever', async () => {
    const { job, archive } = setup();
    archive.importPeriod.mockResolvedValue({
      found: 5,
      remaining: 4,
      results: [{ messageId: '1', status: ImportStatus.Failed }],
    });
    await job.run();
    expect(archive.importPeriod).toHaveBeenCalledTimes(2);
  });

  it('keeps going after a company fails', async () => {
    const { job, archive } = setup();
    archive.importPeriod
      .mockRejectedValueOnce(new BadRequestException('fără certificat'))
      .mockResolvedValueOnce(imported(1, 0));
    await job.run();
    expect(archive.importPeriod).toHaveBeenLastCalledWith(2, 8, 60, true);
  });

  it('logs each run with the companies, imported invoices and failures', async () => {
    const { job, archive, recordJob } = setup();
    archive.importPeriod
      .mockRejectedValueOnce(new BadRequestException('fără certificat'))
      .mockResolvedValueOnce(imported(2, 0));
    await job.run();
    expect(recordJob).toHaveBeenCalledWith({
      action: JobActivityAction.Completed,
      description:
        'Importul automat în arhiva e-Factura a rulat: 2 facturi importate pentru 2 firme (1 eroare)',
      details: {
        job: ScheduledJob.EfacturaArchiveSync,
        companies: 2,
        imported: 2,
        failed: 1,
      },
    });
  });

  it('logs a failed run with the error', async () => {
    const { job, companies, recordJob } = setup();
    companies.find.mockReset();
    companies.find.mockRejectedValue(new Error('connection lost'));
    await job.run();
    expect(recordJob).toHaveBeenCalledWith({
      action: JobActivityAction.Failed,
      description:
        'Importul automat în arhiva e-Factura a eșuat: connection lost',
      details: { job: ScheduledJob.EfacturaArchiveSync },
      error: 'connection lost',
    });
  });

  it('logs nothing when the sync is off or another instance runs it', async () => {
    const off = setup({ enabled: false });
    await off.job.run();
    const other = setup({ locked: false });
    await other.job.run();
    expect(off.recordJob).not.toHaveBeenCalled();
    expect(other.recordJob).not.toHaveBeenCalled();
  });
});
