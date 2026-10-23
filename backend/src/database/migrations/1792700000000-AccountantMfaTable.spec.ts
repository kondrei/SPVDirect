import { describe, expect, it, vi } from 'vitest';
import type { QueryRunner } from 'typeorm';
import { AccountantMfaTable1792700000000 } from './1792700000000-AccountantMfaTable.js';

function run(direction: 'up' | 'down') {
  const query = vi.fn();
  return new AccountantMfaTable1792700000000()
    [direction]({ query } as unknown as QueryRunner)
    .then(() =>
      query.mock.calls.map((c) => String(c[0]).replaceAll(/\s+/g, ' ').trim()),
    );
}

describe('AccountantMfaTable1792700000000', () => {
  it('creates accountant_mfa keyed by the accountant and deleted with it', async () => {
    const [create] = await run('up');
    expect(create).toContain('CREATE TABLE "accountant_mfa"');
    expect(create).toContain(
      'CONSTRAINT "accountant_mfa_pkey" PRIMARY KEY ("accountant_id")',
    );
    expect(create).toContain(
      'FOREIGN KEY ("accountant_id") REFERENCES "accountants" ("id") ON DELETE CASCADE',
    );
    for (const column of [
      '"secret" text',
      '"app_enabled_at" timestamptz',
      '"email_enabled_at" timestamptz',
      '"last_used_step" integer',
      '"failed_attempts" integer NOT NULL DEFAULT 0',
      '"locked_until" timestamptz',
      '"recovery_hash" text',
      '"recovery_failures" integer NOT NULL DEFAULT 0',
      '"email_code_hash" text',
      '"email_code_expires_at" timestamptz',
      '"email_code_sent_at" timestamptz',
    ]) {
      expect(create).toContain(column);
    }
  });

  it('moves the existing MFA data, then drops the old columns but keeps mfa_changed_at', async () => {
    const [, copy, drop] = await run('up');
    expect(copy).toMatch(/^INSERT INTO "accountant_mfa" .* FROM "accountants"/);
    expect(copy).toContain('"mfa_secret" IS NOT NULL');
    expect(drop).toBe(
      'ALTER TABLE "accountants" DROP COLUMN "mfa_secret", DROP COLUMN "mfa_enabled_at", DROP COLUMN "mfa_last_used_step", DROP COLUMN "mfa_failed_attempts", DROP COLUMN "mfa_locked_until", DROP COLUMN "mfa_recovery_hash", DROP COLUMN "mfa_recovery_failures"',
    );
    expect(drop).not.toContain('mfa_changed_at');
  });

  it('restores the columns and copies the app data back before dropping the table', async () => {
    const [add, copy, drop] = await run('down');
    expect(add).toContain('ADD COLUMN "mfa_secret" text');
    expect(add).toContain(
      'ADD COLUMN "mfa_recovery_failures" integer NOT NULL DEFAULT 0',
    );
    expect(copy).toMatch(
      /^UPDATE "accountants" a SET .* FROM "accountant_mfa" m/,
    );
    expect(drop).toBe('DROP TABLE "accountant_mfa"');
  });
});
