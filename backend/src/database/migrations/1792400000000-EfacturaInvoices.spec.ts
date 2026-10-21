import { describe, expect, it, vi } from 'vitest';
import type { QueryRunner } from 'typeorm';
import { EfacturaInvoices1792400000000 } from './1792400000000-EfacturaInvoices.js';

function run(direction: 'up' | 'down') {
  const query = vi.fn();
  return new EfacturaInvoices1792400000000()
    [direction]({ query } as unknown as QueryRunner)
    .then(() => query.mock.calls.map((c) => String(c[0])).join('\n'));
}

describe('EfacturaInvoices1792400000000', () => {
  it('creates the archive table with the parsed header and the files', async () => {
    const sql = await run('up');
    expect(sql).toContain('CREATE TABLE "efactura_invoices"');
    for (const column of [
      '"anaf_message_id" varchar(20) NOT NULL',
      '"direction" varchar(8) NOT NULL',
      '"total_gross" numeric(14,2)',
      `"lines" jsonb NOT NULL DEFAULT '[]'::jsonb`,
      '"zip_content" bytea',
      '"zip_storage_path" text',
      '"pdf_content" bytea',
      '"deleted_at" timestamptz',
    ]) {
      expect(sql).toContain(column);
    }
    expect(sql).toContain(`CHECK ("direction" IN ('received', 'sent'))`);
    expect(sql).toContain(
      'CHECK ("zip_content" IS NOT NULL OR "zip_storage_path" IS NOT NULL)',
    );
  });

  it('removes the rows with the account or the company and keeps them when a certificate or invoice goes away', async () => {
    const sql = await run('up');
    expect(sql).toMatch(
      /fk_efactura_invoices_accountant[^\n]*ON DELETE CASCADE/,
    );
    expect(sql).toMatch(/fk_efactura_invoices_company[^\n]*ON DELETE CASCADE/);
    expect(sql).toMatch(
      /fk_efactura_invoices_connection[^\n]*ON DELETE SET NULL/,
    );
    expect(sql).toMatch(/fk_efactura_invoices_invoice[^\n]*ON DELETE SET NULL/);
  });

  it('keeps one live row per message and indexes the list', async () => {
    const sql = await run('up');
    expect(sql).toContain(
      'CREATE UNIQUE INDEX "uq_efactura_invoices_message" ON "efactura_invoices" ("company_id", "environment", "anaf_message_id") WHERE "deleted_at" IS NULL',
    );
    expect(sql).toContain('CREATE INDEX "idx_efactura_invoices_list"');
  });

  it('reverts', async () => {
    expect(await run('down')).toContain('DROP TABLE "efactura_invoices"');
  });
});
