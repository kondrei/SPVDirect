import { describe, expect, it, vi } from 'vitest';
import type { QueryRunner } from 'typeorm';
import { AccountantMfaRequest1792800000000 } from './1792800000000-AccountantMfaRequest.js';

function run(direction: 'up' | 'down') {
  const query = vi.fn();
  return new AccountantMfaRequest1792800000000()
    [direction]({ query } as unknown as QueryRunner)
    .then(() =>
      query.mock.calls.map((c) => String(c[0]).replaceAll(/\s+/g, ' ').trim()),
    );
}

describe('AccountantMfaRequest1792800000000', () => {
  it('adds requested_method limited to the app and email methods', async () => {
    expect(await run('up')).toEqual([
      `ALTER TABLE "accountant_mfa" ADD COLUMN "requested_method" text, ADD CONSTRAINT "accountant_mfa_requested_method_check" CHECK ("requested_method" IN ('app', 'email'))`,
    ]);
  });

  it('drops the constraint and the column', async () => {
    expect(await run('down')).toEqual([
      'ALTER TABLE "accountant_mfa" DROP CONSTRAINT "accountant_mfa_requested_method_check", DROP COLUMN "requested_method"',
    ]);
  });
});
