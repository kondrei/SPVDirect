import { describe, expect, it, vi } from 'vitest';
import type { QueryRunner } from 'typeorm';
import { AccountApproval1790700000000 } from './1790700000000-AccountApproval.js';

function recorder() {
  const query = vi.fn();
  const qr = { query } as unknown as QueryRunner;
  const sql = () =>
    query.mock.calls.map(([q]) => (q as string).replace(/\s+/g, ' ').trim());
  return { qr, sql };
}

describe('AccountApproval1790700000000', () => {
  it('keeps existing accountants active and makes new ones pending', async () => {
    const { qr, sql } = recorder();
    await new AccountApproval1790700000000().up(qr);
    const statements = sql();
    expect(statements.slice(0, 3)).toEqual([
      `ALTER TABLE "accountants" ADD "status" text NOT NULL DEFAULT 'active'`,
      `ALTER TABLE "accountants" ALTER COLUMN "status" SET DEFAULT 'pending'`,
      `ALTER TABLE "accountants" ADD CONSTRAINT "accountants_status_check" CHECK (status IN ('pending', 'active'))`,
    ]);
    expect(statements).toContain(
      `ALTER TABLE "accountants" ADD CONSTRAINT "accountants_approval_token_hash_key" UNIQUE ("approval_token_hash")`,
    );
  });

  it('creates banned_emails with a case-insensitive unique email', async () => {
    const { qr, sql } = recorder();
    await new AccountApproval1790700000000().up(qr);
    const create = sql().find((s) => s.startsWith('CREATE TABLE'));
    expect(create).toContain('"banned_emails"');
    expect(create).toContain('"email" citext NOT NULL');
    expect(create).toContain(
      'CONSTRAINT "banned_emails_email_key" UNIQUE ("email")',
    );
  });

  it('drops the table, pending accounts and both columns on down', async () => {
    const { qr, sql } = recorder();
    await new AccountApproval1790700000000().down(qr);
    expect(sql()).toEqual([
      `DROP TABLE "banned_emails"`,
      `DELETE FROM "accountants" WHERE status = 'pending'`,
      `ALTER TABLE "accountants" DROP CONSTRAINT "accountants_approval_token_hash_key"`,
      `ALTER TABLE "accountants" DROP COLUMN "approval_token_hash"`,
      `ALTER TABLE "accountants" DROP CONSTRAINT "accountants_status_check"`,
      `ALTER TABLE "accountants" DROP COLUMN "status"`,
    ]);
  });
});
