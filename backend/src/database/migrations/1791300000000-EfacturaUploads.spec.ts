import { describe, expect, it, vi } from 'vitest';
import type { QueryRunner } from 'typeorm';
import { EfacturaUploads1791300000000 } from './1791300000000-EfacturaUploads.js';

function run(direction: 'up' | 'down') {
  const query = vi.fn();
  return new EfacturaUploads1791300000000()
    [direction]({ query } as unknown as QueryRunner)
    .then(() => query.mock.calls.map((c) => String(c[0])).join('\n'));
}

describe('EfacturaUploads1791300000000', () => {
  it('creates the uploads table with its keys', async () => {
    const sql = await run('up');
    expect(sql).toContain('CREATE TABLE "efactura_uploads"');
    for (const column of [
      '"upload_index" varchar(20)',
      '"download_id" varchar(20)',
      '"environment" varchar(4) NOT NULL',
      '"status" varchar(12) NOT NULL',
    ]) {
      expect(sql).toContain(column);
    }
    expect(sql).toMatch(/fk_efactura_uploads_accountant[^\n]*ON DELETE CASCADE/);
  });

  it('keeps the upload record when the invoice or certificate goes away', async () => {
    const sql = await run('up');
    expect(sql).toMatch(/fk_efactura_uploads_invoice[^\n]*ON DELETE SET NULL/);
    expect(sql).toMatch(
      /fk_efactura_uploads_connection[^\n]*ON DELETE SET NULL/,
    );
  });

  it('reverts', async () => {
    expect(await run('down')).toContain('DROP TABLE "efactura_uploads"');
  });
});
