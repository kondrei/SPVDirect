import { describe, expect, it, vi } from 'vitest';
import type { QueryRunner } from 'typeorm';
import { ApiLogSystemJobs1792500000000 } from './1792500000000-ApiLogSystemJobs.js';

function run(direction: 'up' | 'down') {
  const query = vi.fn();
  return new ApiLogSystemJobs1792500000000()
    [direction]({ query } as unknown as QueryRunner)
    .then(() => query.mock.calls.map((c) => String(c[0])));
}

describe('ApiLogSystemJobs1792500000000', () => {
  it('lets api_logs hold scheduled job rows without an accountant', async () => {
    expect(await run('up')).toEqual([
      'ALTER TABLE "api_logs" ALTER COLUMN "accountant_id" DROP NOT NULL',
    ]);
  });

  it('removes the job rows before restoring NOT NULL on the accountant', async () => {
    expect(await run('down')).toEqual([
      'DELETE FROM "api_logs" WHERE "accountant_id" IS NULL',
      'ALTER TABLE "api_logs" ALTER COLUMN "accountant_id" SET NOT NULL',
    ]);
  });
});
