import { describe, expect, it, vi } from 'vitest';
import type { QueryRunner, TableColumn } from 'typeorm';
import { AdminNotifiedAt1790800000000 } from './1790800000000-AdminNotifiedAt.js';

function recorder() {
  const addColumn = vi.fn();
  const dropColumn = vi.fn();
  const qr = { addColumn, dropColumn } as unknown as QueryRunner;
  return { qr, addColumn, dropColumn };
}

describe('AdminNotifiedAt1790800000000', () => {
  it('adds a nullable admin_notified_at to accountants', async () => {
    const { qr, addColumn } = recorder();
    await new AdminNotifiedAt1790800000000().up(qr);
    const [table, col] = addColumn.mock.calls[0] as [string, TableColumn];
    expect(table).toBe('accountants');
    expect(col).toMatchObject({
      name: 'admin_notified_at',
      type: 'timestamptz',
      isNullable: true,
    });
  });

  it('drops the same column on down', async () => {
    const { qr, dropColumn } = recorder();
    await new AdminNotifiedAt1790800000000().down(qr);
    const [table, col] = dropColumn.mock.calls[0] as [string, TableColumn];
    expect(table).toBe('accountants');
    expect(col.name).toBe('admin_notified_at');
  });
});
