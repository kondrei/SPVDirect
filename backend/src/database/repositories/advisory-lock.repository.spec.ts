import type { DataSource } from 'typeorm';
import { AdvisoryLockRepository } from './advisory-lock.repository.js';

function setup(locked: boolean) {
  const runner = {
    query: vi.fn((sql: string) =>
      Promise.resolve(sql.includes('try_advisory') ? [{ locked }] : []),
    ),
    release: vi.fn().mockResolvedValue(undefined),
  };
  const dataSource = { createQueryRunner: vi.fn(() => runner) };
  const locks = new AdvisoryLockRepository(dataSource as unknown as DataSource);
  return { locks, runner };
}

describe('AdvisoryLockRepository.runExclusive', () => {
  it('runs the work while holding the lock, then unlocks and releases', async () => {
    const { locks, runner } = setup(true);
    const work = vi.fn().mockResolvedValue(undefined);
    await expect(locks.runExclusive(42, work)).resolves.toBe(true);
    expect(runner.query).toHaveBeenNthCalledWith(
      1,
      'SELECT pg_try_advisory_lock($1) AS locked',
      [42],
    );
    expect(work).toHaveBeenCalledOnce();
    expect(runner.query).toHaveBeenNthCalledWith(
      2,
      'SELECT pg_advisory_unlock($1)',
      [42],
    );
    expect(runner.release).toHaveBeenCalledOnce();
  });

  it('skips the work and never unlocks when another session holds the lock', async () => {
    const { locks, runner } = setup(false);
    const work = vi.fn();
    await expect(locks.runExclusive(42, work)).resolves.toBe(false);
    expect(work).not.toHaveBeenCalled();
    expect(runner.query).toHaveBeenCalledOnce();
    expect(runner.release).toHaveBeenCalledOnce();
  });

  it('unlocks and releases when the work fails, and rethrows', async () => {
    const { locks, runner } = setup(true);
    await expect(
      locks.runExclusive(42, () => Promise.reject(new Error('boom'))),
    ).rejects.toThrow('boom');
    expect(runner.query).toHaveBeenLastCalledWith(
      'SELECT pg_advisory_unlock($1)',
      [42],
    );
    expect(runner.release).toHaveBeenCalledOnce();
  });

  it('still releases the runner when unlocking fails', async () => {
    const { locks, runner } = setup(true);
    runner.query.mockImplementation((sql: string) =>
      sql.includes('unlock')
        ? Promise.reject(new Error('gone'))
        : Promise.resolve([{ locked: true }]),
    );
    await expect(locks.runExclusive(42, vi.fn())).resolves.toBe(true);
    expect(runner.release).toHaveBeenCalledOnce();
  });
});
