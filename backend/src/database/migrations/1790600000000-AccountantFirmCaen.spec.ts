import { describe, expect, it, vi } from 'vitest';
import type { QueryRunner, TableColumn } from 'typeorm';
import { AccountantFirmCaen1790600000000 } from './1790600000000-AccountantFirmCaen.js';

function recorder() {
  const addColumn = vi.fn();
  const dropColumn = vi.fn();
  const qr = { addColumn, dropColumn } as unknown as QueryRunner;
  return { qr, addColumn, dropColumn };
}

describe('AccountantFirmCaen1790600000000', () => {
  it('adds a nullable firm_caen_code to accountants', async () => {
    const { qr, addColumn } = recorder();
    await new AccountantFirmCaen1790600000000().up(qr);
    const [table, col] = addColumn.mock.calls[0] as [string, TableColumn];
    expect(table).toBe('accountants');
    expect(col).toMatchObject({
      name: 'firm_caen_code',
      type: 'varchar',
      length: '10',
      isNullable: true,
    });
  });

  it('drops the same column on down', async () => {
    const { qr, dropColumn } = recorder();
    await new AccountantFirmCaen1790600000000().down(qr);
    const [table, col] = dropColumn.mock.calls[0] as [string, TableColumn];
    expect(table).toBe('accountants');
    expect(col.name).toBe('firm_caen_code');
  });
});
