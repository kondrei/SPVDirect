import { describe, expect, it, vi } from 'vitest';
import type { QueryRunner } from 'typeorm';
import { AccountantSoftDelete1792100000000 } from './1792100000000-AccountantSoftDelete.js';

function run(direction: 'up' | 'down') {
  const query = vi.fn();
  return new AccountantSoftDelete1792100000000()
    [direction]({ query } as unknown as QueryRunner)
    .then(() => query.mock.calls.map((c) => String(c[0])));
}

describe('AccountantSoftDelete1792100000000', () => {
  it('adds deleted_at and keeps emails unique among live accounts only', async () => {
    expect(await run('up')).toEqual([
      'ALTER TABLE "accountants" ADD COLUMN "deleted_at" timestamptz NULL',
      'ALTER TABLE "accountants" DROP CONSTRAINT "accountants_email_key"',
      'CREATE UNIQUE INDEX "accountants_email_key" ON "accountants" ("email") WHERE "deleted_at" IS NULL',
      'CREATE INDEX "idx_accountants_deleted_at" ON "accountants" ("deleted_at") WHERE "deleted_at" IS NOT NULL',
    ]);
  });

  it('restores the plain unique email constraint on down', async () => {
    expect(await run('down')).toEqual([
      'DROP INDEX "idx_accountants_deleted_at"',
      'DROP INDEX "accountants_email_key"',
      'ALTER TABLE "accountants" ADD CONSTRAINT "accountants_email_key" UNIQUE ("email")',
      'ALTER TABLE "accountants" DROP COLUMN "deleted_at"',
    ]);
  });
});
