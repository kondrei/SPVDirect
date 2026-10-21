import { describe, expect, it, vi } from 'vitest';
import type { QueryRunner } from 'typeorm';
import { ApiLogActivity1792300000000 } from './1792300000000-ApiLogActivity.js';

function run(direction: 'up' | 'down') {
  const query = vi.fn();
  return new ApiLogActivity1792300000000()
    [direction]({ query } as unknown as QueryRunner)
    .then(() => query.mock.calls.map((c) => String(c[0])));
}

describe('ApiLogActivity1792300000000', () => {
  it('lets api_logs hold app activity with a description and details', async () => {
    expect(await run('up')).toEqual([
      'ALTER TABLE "api_logs" ADD "description" text',
      'ALTER TABLE "api_logs" ADD "details" jsonb',
      'ALTER TABLE "api_logs" ALTER COLUMN "response_time_ms" DROP NOT NULL',
      `CREATE INDEX "idx_api_logs_activity" ON "api_logs" ("accountant_id", "created_at" DESC, "id" DESC) WHERE "service" = 'ACTIVITY'`,
    ]);
  });

  it('removes the activity rows before restoring NOT NULL on the response time', async () => {
    expect(await run('down')).toEqual([
      'DROP INDEX "idx_api_logs_activity"',
      `DELETE FROM "api_logs" WHERE "service" = 'ACTIVITY'`,
      'ALTER TABLE "api_logs" ALTER COLUMN "response_time_ms" SET NOT NULL',
      'ALTER TABLE "api_logs" DROP COLUMN "details"',
      'ALTER TABLE "api_logs" DROP COLUMN "description"',
    ]);
  });
});
