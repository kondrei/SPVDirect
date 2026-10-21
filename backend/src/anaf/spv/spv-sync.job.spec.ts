import type { Repository } from 'typeorm';
import type { ActivityLogsService } from '../../api-logs/activity-logs.service.js';
import {
  JobActivityAction,
  ScheduledJob,
} from '../../api-logs/dto/api-log.enums.js';
import { SPV_SYNC_SCHEDULE } from '../../common/constants.js';
import type { AnafConnection } from '../anaf-connection.entity.js';
import type { SpvArchiveService } from './services/spv-archive.service.js';
import { SpvSyncJob } from './spv-sync.job.js';

function setup(rows: { id: string; accountantId: number }[]) {
  const sync = vi.fn().mockResolvedValue({});
  const moveStoredContent = vi.fn().mockResolvedValue(0);
  const find = vi.fn().mockResolvedValue(rows);
  const recordJob = vi.fn().mockResolvedValue(undefined);
  const job = new SpvSyncJob(
    { sync, moveStoredContent } as unknown as SpvArchiveService,
    { find } as unknown as Repository<AnafConnection>,
    { recordJob } as unknown as ActivityLogsService,
  );
  return { job, sync, find, moveStoredContent, recordJob };
}

describe('SpvSyncJob', () => {
  it('runs at 03:00 on Monday, Wednesday and Friday', () => {
    expect(SPV_SYNC_SCHEDULE).toBe('0 3 * * 1,3,5');
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

  it('keeps going when one connection fails and logs the run with its errors', async () => {
    const { job, sync, moveStoredContent, recordJob } = setup([
      { id: 'a', accountantId: 1 },
      { id: 'b', accountantId: 2 },
    ]);
    sync.mockRejectedValueOnce(new Error('refused'));
    moveStoredContent.mockResolvedValueOnce(4).mockResolvedValueOnce(0);
    await job.run();
    expect(sync).toHaveBeenCalledTimes(2);
    expect(recordJob).toHaveBeenCalledWith({
      action: JobActivityAction.Completed,
      description:
        'Sincronizarea SPV a rulat: 1 certificat sincronizat, 4 documente mutate în Storage (1 eroare)',
      details: {
        job: ScheduledJob.SpvSync,
        connections: 1,
        moved: 4,
        failed: 1,
      },
    });
  });

  it('logs a failed run when the connections cannot be read', async () => {
    const { job, find, recordJob } = setup([]);
    find.mockRejectedValueOnce(new Error('connection lost'));
    await job.run();
    expect(recordJob).toHaveBeenCalledWith({
      action: JobActivityAction.Failed,
      description: 'Sincronizarea SPV a eșuat: connection lost',
      details: { job: ScheduledJob.SpvSync },
      error: 'connection lost',
    });
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
