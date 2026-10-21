import { describe, expect, it, vi } from 'vitest';
import type { QueryRunner } from 'typeorm';
import { AccountantDeletedStatus1792200000000 } from './1792200000000-AccountantDeletedStatus.js';

function run(direction: 'up' | 'down') {
  const query = vi.fn();
  return new AccountantDeletedStatus1792200000000()
    [direction]({ query } as unknown as QueryRunner)
    .then(() => query.mock.calls.map((c) => String(c[0])));
}

describe('AccountantDeletedStatus1792200000000', () => {
  it('allows the deleted status and marks accounts already soft-deleted', async () => {
    expect(await run('up')).toEqual([
      'ALTER TABLE "accountants" DROP CONSTRAINT "accountants_status_check"',
      `ALTER TABLE "accountants" ADD CONSTRAINT "accountants_status_check" CHECK (status IN ('pending', 'active', 'deleted'))`,
      `UPDATE "accountants" SET "status" = 'deleted' WHERE "deleted_at" IS NOT NULL`,
    ]);
  });

  it('turns deleted back into active before restoring the old check', async () => {
    expect(await run('down')).toEqual([
      `UPDATE "accountants" SET "status" = 'active' WHERE "status" = 'deleted'`,
      'ALTER TABLE "accountants" DROP CONSTRAINT "accountants_status_check"',
      `ALTER TABLE "accountants" ADD CONSTRAINT "accountants_status_check" CHECK (status IN ('pending', 'active'))`,
    ]);
  });
});
