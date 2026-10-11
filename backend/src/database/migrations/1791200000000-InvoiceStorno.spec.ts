import { describe, expect, it, vi } from 'vitest';
import type { QueryRunner } from 'typeorm';
import { InvoiceStorno1791200000000 } from './1791200000000-InvoiceStorno.js';

function run(direction: 'up' | 'down') {
  const query = vi.fn();
  return new InvoiceStorno1791200000000()
    [direction]({ query } as unknown as QueryRunner)
    .then(() => query.mock.calls.map((c) => String(c[0])).join('\n'));
}

describe('InvoiceStorno1791200000000', () => {
  it('adds the reference to the reversed invoice', async () => {
    const sql = await run('up');
    for (const column of [
      '"storno_of_invoice_id" integer',
      '"storno_of_series"',
      '"storno_of_number"',
      '"storno_of_issue_date"',
    ]) {
      expect(sql).toContain(`ADD COLUMN ${column}`);
    }
    expect(sql).toContain('CREATE INDEX "idx_invoices_storno_of"');
  });

  it('never lets an invoice that was reversed be deleted', async () => {
    const sql = await run('up');
    expect(sql).toMatch(/fk_invoices_storno_of[^\n]*ON DELETE RESTRICT/);
  });

  it('reverts', async () => {
    const sql = await run('down');
    expect(sql).toContain('DROP COLUMN "storno_of_invoice_id"');
    expect(sql).toContain('DROP INDEX "idx_invoices_storno_of"');
  });
});
