import { describe, expect, it, vi } from 'vitest';
import type { QueryRunner, TableColumn } from 'typeorm';
import { SpvMessageStoragePath1791000000000 } from './1791000000000-SpvMessageStoragePath.js';

describe('SpvMessageStoragePath1791000000000', () => {
  it('adds a nullable storage_path to spv_messages', async () => {
    const addColumn = vi.fn();
    await new SpvMessageStoragePath1791000000000().up({
      addColumn,
    } as unknown as QueryRunner);
    const [table, col] = addColumn.mock.calls[0] as [string, TableColumn];
    expect(table).toBe('spv_messages');
    expect(col).toMatchObject({
      name: 'storage_path',
      type: 'text',
      isNullable: true,
    });
  });

  it('drops the column on down', async () => {
    const dropColumn = vi.fn();
    await new SpvMessageStoragePath1791000000000().down({
      dropColumn,
    } as unknown as QueryRunner);
    const [table, col] = dropColumn.mock.calls[0] as [string, TableColumn];
    expect(table).toBe('spv_messages');
    expect(col.name).toBe('storage_path');
  });
});
