import type { DataSource, Repository } from 'typeorm';
import type { Accountant } from '../../accountants/accountant.entity.js';
import type { Company } from '../company.entity.js';
import type { CompanyDeletionService } from './company-deletion.service.js';
import {
  PURGE_BATCH,
  PURGE_GRACE_DAYS,
  PURGE_LOCK_KEY,
  PURGE_SCHEDULE,
  PurgeJob,
} from './purge.job.js';

function setup(
  batches: number[][],
  accountantBatches: number[][] = [],
  locked = true,
) {
  const find = vi.fn();
  for (const ids of batches) {
    find.mockResolvedValueOnce(ids.map((id) => ({ id })));
  }
  find.mockResolvedValue([]);
  const findAccountants = vi.fn();
  for (const ids of accountantBatches) {
    findAccountants.mockResolvedValueOnce(ids.map((id) => ({ id })));
  }
  findAccountants.mockResolvedValue([]);
  const purge = vi.fn().mockResolvedValue(undefined);
  const purgeAccountant = vi.fn().mockResolvedValue(undefined);
  const runner = {
    query: vi.fn((sql: string) =>
      Promise.resolve(sql.includes('try') ? [{ locked }] : [{}]),
    ),
    release: vi.fn().mockResolvedValue(undefined),
  };
  const dataSource = { createQueryRunner: vi.fn(() => runner) };
  const job = new PurgeJob(
    { find } as unknown as Repository<Company>,
    { find: findAccountants } as unknown as Repository<Accountant>,
    { purge, purgeAccountant } as unknown as CompanyDeletionService,
    dataSource as unknown as DataSource,
  );
  return { job, find, findAccountants, purge, purgeAccountant, runner };
}

describe('PurgeJob', () => {
  afterEach(() => vi.useRealTimers());

  it('purges deleted companies first, then deleted accounts past the same cutoff', async () => {
    const { job, purge, purgeAccountant, findAccountants } = setup(
      [[3]],
      [[8, 9]],
    );
    purgeAccountant.mockRejectedValueOnce(new Error('storage down'));
    await job.run();
    expect(purge).toHaveBeenCalledWith(3);
    expect(purgeAccountant.mock.calls).toEqual([[8], [9]]);
    expect(purge.mock.invocationCallOrder[0]).toBeLessThan(
      purgeAccountant.mock.invocationCallOrder[0],
    );
    expect(findAccountants.mock.calls[0][0]).toMatchObject({
      withDeleted: true,
      take: PURGE_BATCH,
    });
  });

  it('runs on the 1st of each month at 03:00', () => {
    expect(PURGE_SCHEDULE).toBe('0 3 1 * *');
  });

  it('picks companies deleted more than 30 days ago, including soft-deleted rows', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-01T01:00:00Z'));
    const { job, find } = setup([]);
    await job.run();
    const options = find.mock.calls[0][0] as {
      where: { deletedAt: { value: Date }; id: { value: number } };
      withDeleted: boolean;
      take: number;
    };
    expect(PURGE_GRACE_DAYS).toBe(30);
    expect(options.where.deletedAt.value).toEqual(
      new Date('2026-10-02T01:00:00Z'),
    );
    expect(options.where.id.value).toBe(0);
    expect(options.withDeleted).toBe(true);
    expect(options.take).toBe(PURGE_BATCH);
  });

  it('purges every due company, page after page', async () => {
    const first = Array.from({ length: PURGE_BATCH }, (_, i) => i + 1);
    const { job, find, purge } = setup([first, [PURGE_BATCH + 1]]);
    await job.run();
    expect(purge).toHaveBeenCalledTimes(PURGE_BATCH + 1);
    const second = find.mock.calls[1][0] as {
      where: { id: { value: number } };
    };
    expect(second.where.id.value).toBe(PURGE_BATCH);
    expect(find).toHaveBeenCalledTimes(2);
  });

  it('moves on to the next company when one fails', async () => {
    const { job, purge } = setup([[3, 4]]);
    purge.mockRejectedValueOnce(new Error('storage down'));
    await job.run();
    expect(purge.mock.calls).toEqual([[3], [4]]);
  });

  it('does not overlap a run that is still going', async () => {
    const { job, purge } = setup([[3]]);
    let release!: () => void;
    purge.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        release = resolve;
      }),
    );
    const first = job.run();
    await vi.waitFor(() => expect(purge).toHaveBeenCalledOnce());
    await job.run();
    release();
    await first;
    expect(purge).toHaveBeenCalledOnce();
  });

  it('holds a Postgres advisory lock for the run and releases it', async () => {
    const { job, purge, runner } = setup([[3]]);
    await job.run();
    expect(purge).toHaveBeenCalledWith(3);
    expect(runner.query.mock.calls).toEqual([
      ['SELECT pg_try_advisory_lock($1) AS locked', [PURGE_LOCK_KEY]],
      ['SELECT pg_advisory_unlock($1)', [PURGE_LOCK_KEY]],
    ]);
    expect(runner.release).toHaveBeenCalledOnce();
  });

  it('skips the run when another instance holds the lock', async () => {
    const { job, find, purge, runner } = setup([[3]], [], false);
    await job.run();
    expect(find).not.toHaveBeenCalled();
    expect(purge).not.toHaveBeenCalled();
    expect(runner.query).toHaveBeenCalledOnce();
    expect(runner.release).toHaveBeenCalledOnce();
  });

  it('releases the lock when purging fails', async () => {
    const { job, find, runner } = setup([]);
    find.mockReset();
    find.mockRejectedValue(new Error('connection lost'));
    await job.run();
    expect(runner.query).toHaveBeenLastCalledWith(
      'SELECT pg_advisory_unlock($1)',
      [PURGE_LOCK_KEY],
    );
    expect(runner.release).toHaveBeenCalledOnce();
  });

  it('survives a database error and runs again next time', async () => {
    const { job, find, purge } = setup([]);
    find.mockReset();
    find.mockRejectedValueOnce(new Error('connection lost'));
    find.mockResolvedValueOnce([{ id: 3 }]).mockResolvedValue([]);
    await expect(job.run()).resolves.toBeUndefined();
    await job.run();
    expect(purge).toHaveBeenCalledWith(3);
  });
});
