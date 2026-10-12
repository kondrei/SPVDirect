import { describe, expect, it, vi } from 'vitest';
import type { QueryRunner, TableColumn } from 'typeorm';
import { PasswordChangedAt1791400000000 } from './1791400000000-PasswordChangedAt.js';

function recorder() {
  const addColumn = vi.fn();
  const dropColumn = vi.fn();
  const qr = { addColumn, dropColumn } as unknown as QueryRunner;
  return { qr, addColumn, dropColumn };
}

describe('PasswordChangedAt1791400000000', () => {
  it('adds a nullable password_changed_at to accountants', async () => {
    const { qr, addColumn } = recorder();
    await new PasswordChangedAt1791400000000().up(qr);
    const [table, col] = addColumn.mock.calls[0] as [string, TableColumn];
    expect(table).toBe('accountants');
    expect(col).toMatchObject({
      name: 'password_changed_at',
      type: 'timestamptz',
      isNullable: true,
    });
  });

  it('drops the same column on down', async () => {
    const { qr, dropColumn } = recorder();
    await new PasswordChangedAt1791400000000().down(qr);
    const [table, col] = dropColumn.mock.calls[0] as [string, TableColumn];
    expect(table).toBe('accountants');
    expect(col.name).toBe('password_changed_at');
  });
});
