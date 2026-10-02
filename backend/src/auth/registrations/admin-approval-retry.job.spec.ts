import type { CommandBus } from '@nestjs/cqrs';
import type { Repository } from 'typeorm';
import type { Accountant } from '../../accountants/accountant.entity.js';
import {
  AdminApprovalRetryJob,
  RETRY_BATCH,
  RETRY_GRACE_MS,
  RETRY_SCHEDULE,
} from './admin-approval-retry.job.js';
import { ResendAdminApprovalCommand } from './resend-admin-approval.command.js';

function setup(ids: number[]) {
  const execute = vi.fn().mockResolvedValue('sent');
  const find = vi.fn().mockResolvedValue(ids.map((id) => ({ id })));
  const job = new AdminApprovalRetryJob(
    { execute } as unknown as CommandBus,
    { find } as unknown as Repository<Accountant>,
  );
  return { job, execute, find };
}

describe('AdminApprovalRetryJob', () => {
  afterEach(() => vi.useRealTimers());

  it('runs once a day at 08:00', () => {
    expect(RETRY_SCHEDULE).toBe('0 08 * * *');
  });

  it('picks unnotified pending requests older than the grace period', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-02T10:00:00Z'));
    const { job, find } = setup([]);
    await job.run();
    const options = find.mock.calls[0][0] as {
      where: { status: string; createdAt: { value: Date } };
      take: number;
    };
    expect(options.where.status).toBe('pending');
    expect(options.where.createdAt.value).toEqual(
      new Date(Date.parse('2026-10-02T10:00:00Z') - RETRY_GRACE_MS),
    );
    expect(options.take).toBe(RETRY_BATCH);
  });

  it('resends each request through the command bus', async () => {
    const { job, execute } = setup([3, 4]);
    await job.run();
    expect(execute.mock.calls).toEqual([
      [new ResendAdminApprovalCommand(3)],
      [new ResendAdminApprovalCommand(4)],
    ]);
  });

  it('stops the batch at the first SMTP failure', async () => {
    const { job, execute } = setup([3, 4, 5]);
    execute.mockResolvedValueOnce('skipped').mockResolvedValueOnce('failed');
    await job.run();
    expect(execute).toHaveBeenCalledTimes(2);
  });

  it('does not overlap a run that is still going', async () => {
    const { job, execute } = setup([3]);
    let release!: () => void;
    execute.mockReturnValueOnce(
      new Promise((resolve) => {
        release = () => resolve('sent');
      }),
    );
    const first = job.run();
    await vi.waitFor(() => expect(execute).toHaveBeenCalledOnce());
    await job.run();
    release();
    await first;
    expect(execute).toHaveBeenCalledOnce();
  });

  it('survives a database error and runs again next time', async () => {
    const { job, find, execute } = setup([3]);
    find.mockRejectedValueOnce(new Error('connection lost'));
    await expect(job.run()).resolves.toBeUndefined();
    await job.run();
    expect(execute).toHaveBeenCalledOnce();
  });
});
