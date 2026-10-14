import { describe, expect, it, vi } from 'vitest';
import type { QueryRunner } from 'typeorm';
import { EfacturaUploadClaim1791700000000 } from './1791700000000-EfacturaUploadClaim.js';

function run(direction: 'up' | 'down') {
  const query = vi.fn();
  return new EfacturaUploadClaim1791700000000()
    [direction]({ query } as unknown as QueryRunner)
    .then(() => query.mock.calls.map((c) => String(c[0])).join('\n'));
}

describe('EfacturaUploadClaim1791700000000', () => {
  it('allows one sending, processing or accepted upload per invoice', async () => {
    const sql = await run('up');
    expect(sql).toContain(
      'CREATE UNIQUE INDEX "uq_efactura_uploads_invoice_active" ON "efactura_uploads" ("invoice_id")',
    );
    expect(sql).toContain(`"status" IN ('sending', 'processing', 'ok')`);
  });

  it('reverts', async () => {
    expect(await run('down')).toBe(
      'DROP INDEX "uq_efactura_uploads_invoice_active"',
    );
  });
});
