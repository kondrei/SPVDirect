import { describe, expect, it, vi } from 'vitest';
import type { QueryRunner, TableColumn } from 'typeorm';
import { AnafConnectionTokenState1791800000000 } from './1791800000000-AnafConnectionTokenState.js';

function recorder() {
  const addColumns = vi.fn();
  const dropColumns = vi.fn();
  const qr = { addColumns, dropColumns } as unknown as QueryRunner;
  return { qr, addColumns, dropColumns };
}

const names = [
  'token_call_at',
  'refresh_started_at',
  'denied_with_fresh_token_at',
];

describe('AnafConnectionTokenState1791800000000', () => {
  it('adds the shared token state columns to anaf_connections', async () => {
    const { qr, addColumns } = recorder();
    await new AnafConnectionTokenState1791800000000().up(qr);
    const [table, cols] = addColumns.mock.calls[0] as [string, TableColumn[]];
    expect(table).toBe('anaf_connections');
    expect(cols.map((c) => c.name)).toEqual(names);
    for (const col of cols) {
      expect(col).toMatchObject({ type: 'timestamptz', isNullable: true });
    }
  });

  it('drops the same columns on down', async () => {
    const { qr, dropColumns } = recorder();
    await new AnafConnectionTokenState1791800000000().down(qr);
    const [table, cols] = dropColumns.mock.calls[0] as [string, TableColumn[]];
    expect(table).toBe('anaf_connections');
    expect(cols.map((c) => c.name)).toEqual(names);
  });
});
