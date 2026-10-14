import { describe, expect, it, vi } from 'vitest';
import type { QueryRunner } from 'typeorm';
import { InvoiceBuyerIndex1791500000000 } from './1791500000000-InvoiceBuyerIndex.js';

function run(direction: 'up' | 'down') {
  const query = vi.fn();
  return new InvoiceBuyerIndex1791500000000()
    [direction]({ query } as unknown as QueryRunner)
    .then(() => query.mock.calls.map((c) => String(c[0])).join('\n'));
}

describe('InvoiceBuyerIndex1791500000000', () => {
  it('indexes the invoices of a company by buyer CUI, newest first, without stornos', async () => {
    const sql = await run('up');
    expect(sql).toContain('CREATE INDEX "idx_invoices_company_buyer_cui"');
    expect(sql).toContain(
      `("company_id", ("buyer" ->> 'cui'), "issue_date" DESC, "id" DESC)`,
    );
    expect(sql).toContain('WHERE "storno_of_invoice_id" IS NULL');
  });

  it('reverts', async () => {
    expect(await run('down')).toBe(
      'DROP INDEX "idx_invoices_company_buyer_cui"',
    );
  });
});
