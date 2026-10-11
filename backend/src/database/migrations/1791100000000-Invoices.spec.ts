import { describe, expect, it, vi } from 'vitest';
import type { QueryRunner } from 'typeorm';
import { Invoices1791100000000 } from './1791100000000-Invoices.js';

function run(direction: 'up' | 'down') {
  const query = vi.fn();
  const migration = new Invoices1791100000000();
  return migration[direction]({ query } as unknown as QueryRunner).then(() =>
    query.mock.calls.map((c) => String(c[0])).join('\n'),
  );
}

describe('Invoices1791100000000', () => {
  it('adds the company invoicing columns and logo', async () => {
    const sql = await run('up');
    for (const column of [
      '"iban"',
      '"bank_name"',
      '"email"',
      '"phone"',
      '"logo" bytea',
      '"logo_content_type"',
    ]) {
      expect(sql).toContain(`ADD COLUMN ${column}`);
    }
  });

  it('creates invoices with a unique number per company and series', async () => {
    const sql = await run('up');
    expect(sql).toContain('CREATE TABLE "invoices"');
    expect(sql).toContain('UNIQUE ("company_id", "series", "number")');
    expect(sql).toContain('CREATE INDEX "idx_invoices_accountant_issued"');
  });

  it('keeps issued invoices when a company is deleted', async () => {
    const sql = await run('up');
    expect(sql).toMatch(/fk_invoices_company[^\n]*ON DELETE RESTRICT/);
  });

  it('reverts both changes', async () => {
    const sql = await run('down');
    expect(sql).toContain('DROP TABLE "invoices"');
    expect(sql).toContain('DROP COLUMN "logo"');
  });
});
