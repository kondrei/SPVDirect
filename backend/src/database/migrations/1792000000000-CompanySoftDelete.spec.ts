import { describe, expect, it, vi } from 'vitest';
import type { QueryRunner } from 'typeorm';
import {
  CompanySoftDelete1792000000000,
  SOFT_DELETED_TABLES,
} from './1792000000000-CompanySoftDelete.js';

function run(direction: 'up' | 'down') {
  const query = vi.fn();
  return new CompanySoftDelete1792000000000()
    [direction]({ query } as unknown as QueryRunner)
    .then(() => query.mock.calls.map((c) => String(c[0])));
}

describe('CompanySoftDelete1792000000000', () => {
  it('adds deleted_at to the company and every table that belongs to it', async () => {
    const sql = await run('up');
    expect(SOFT_DELETED_TABLES).toEqual([
      'companies',
      'invoices',
      'efactura_uploads',
      'spv_messages',
    ]);
    for (const table of SOFT_DELETED_TABLES) {
      expect(sql).toContain(
        `ALTER TABLE "${table}" ADD COLUMN "deleted_at" timestamptz NULL`,
      );
    }
  });

  it('keeps CUIs and SPV messages unique among live rows only', async () => {
    const sql = await run('up');
    expect(sql).toContain(
      'ALTER TABLE "companies" DROP CONSTRAINT "uq_companies_accountant_cui"',
    );
    expect(sql).toContain(
      'CREATE UNIQUE INDEX "uq_companies_accountant_cui" ON "companies" ("accountant_id", "cui") WHERE "deleted_at" IS NULL',
    );
    expect(sql).toContain(
      'CREATE UNIQUE INDEX "uq_spv_messages_accountant_message" ON "spv_messages" ("accountant_id", "anaf_message_id") WHERE "deleted_at" IS NULL',
    );
  });

  it('indexes what the monthly purge looks up', async () => {
    const sql = await run('up');
    expect(sql).toContain(
      'CREATE INDEX "idx_companies_deleted_at" ON "companies" ("deleted_at") WHERE "deleted_at" IS NOT NULL',
    );
    expect(sql).toContain(
      'CREATE INDEX "idx_efactura_uploads_company" ON "efactura_uploads" ("company_id")',
    );
    expect(sql).toContain(
      'CREATE INDEX "idx_spv_messages_company" ON "spv_messages" ("company_id")',
    );
  });

  it('restores the unique constraints and drops the columns on down', async () => {
    const sql = await run('down');
    expect(sql).toContain(
      'ALTER TABLE "companies" ADD CONSTRAINT "uq_companies_accountant_cui" UNIQUE ("accountant_id", "cui")',
    );
    expect(sql).toContain(
      'ALTER TABLE "spv_messages" ADD CONSTRAINT "uq_spv_messages_accountant_message" UNIQUE ("accountant_id", "anaf_message_id")',
    );
    expect(
      sql.indexOf('DROP INDEX "uq_companies_accountant_cui"'),
    ).toBeLessThan(
      sql.indexOf(
        'ALTER TABLE "companies" ADD CONSTRAINT "uq_companies_accountant_cui" UNIQUE ("accountant_id", "cui")',
      ),
    );
    for (const table of SOFT_DELETED_TABLES) {
      expect(sql).toContain(`ALTER TABLE "${table}" DROP COLUMN "deleted_at"`);
    }
    expect(sql.at(-1)).toBe('ALTER TABLE "companies" DROP COLUMN "deleted_at"');
  });
});
