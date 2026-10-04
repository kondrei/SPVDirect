import type { Repository } from 'typeorm';
import type { AnafConnection } from '../anaf-connection.entity.js';
import type { SpvArchiveService } from './services/spv-archive.service.js';
import { SpvSyncJob, SYNC_SCHEDULE } from './spv-sync.job.js';

function setup(rows: { id: string; accountantId: number }[]) {
  const sync = vi.fn().mockResolvedValue({});
  const moveStoredContent = vi.fn().mockResolvedValue(0);
  const find = vi.fn().mockResolvedValue(rows);
  const job = new SpvSyncJob(
    { sync, moveStoredContent } as unknown as SpvArchiveService,
    { find } as unknown as Repository<AnafConnection>,
  );
  return { job, sync, find, moveStoredContent };
}

describe('SpvSyncJob', () => {
  it('runs every night at 03:00', () => {
    expect(SYNC_SCHEDULE).toBe('0 03 * * *');
  });

  it('syncs the last 60 days of every active connection', async () => {
    const { job, sync, find } = setup([
      { id: 'a', accountantId: 1 },
      { id: 'b', accountantId: 2 },
    ]);
    await job.run();
    expect(find.mock.calls[0][0].where.status).toBe('active');
    expect(sync).toHaveBeenCalledWith(1, 'a', 60);
    expect(sync).toHaveBeenCalledWith(2, 'b', 60);
  });

  it('keeps going when one connection fails', async () => {
    const { job, sync } = setup([
      { id: 'a', accountantId: 1 },
      { id: 'b', accountantId: 2 },
    ]);
    sync.mockRejectedValueOnce(new Error('refused'));
    await job.run();
    expect(sync).toHaveBeenCalledTimes(2);
  });

  it('does not overlap runs', async () => {
    const { job, sync } = setup([{ id: 'a', accountantId: 1 }]);
    let release: () => void = () => undefined;
    sync.mockReturnValue(new Promise<void>((r) => (release = r)));
    const first = job.run();
    await new Promise((r) => setImmediate(r));
    await job.run();
    release();
    await first;
    expect(sync).toHaveBeenCalledTimes(1);
  });

  it('moves database PDFs to storage in batches until none are left', async () => {
    const { job, moveStoredContent } = setup([]);
    moveStoredContent
      .mockResolvedValueOnce(100)
      .mockResolvedValueOnce(40)
      .mockResolvedValueOnce(0);
    await job.run();
    expect(moveStoredContent).toHaveBeenCalledTimes(3);
  });

  it('survives a storage failure while moving', async () => {
    const { job, moveStoredContent } = setup([]);
    moveStoredContent.mockRejectedValue(new Error('down'));
    await expect(job.run()).resolves.toBeUndefined();
  });
});
