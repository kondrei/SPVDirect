import { describe, expect, it, vi } from 'vitest';
import type { QueryRunner, TableColumn } from 'typeorm';
import { AccountantMfa1792600000000 } from './1792600000000-AccountantMfa.js';

function recorder() {
  const addColumns = vi.fn();
  const dropColumns = vi.fn();
  const qr = { addColumns, dropColumns } as unknown as QueryRunner;
  return { qr, addColumns, dropColumns };
}

const NAMES = [
  'mfa_secret',
  'mfa_enabled_at',
  'mfa_changed_at',
  'mfa_last_used_step',
  'mfa_failed_attempts',
  'mfa_locked_until',
  'mfa_recovery_hash',
  'mfa_recovery_failures',
];

describe('AccountantMfa1792600000000', () => {
  it('adds the MFA columns to accountants', async () => {
    const { qr, addColumns } = recorder();
    await new AccountantMfa1792600000000().up(qr);
    const [table, cols] = addColumns.mock.calls[0] as [string, TableColumn[]];
    expect(table).toBe('accountants');
    expect(cols.map((c) => c.name)).toEqual(NAMES);
    const byName = Object.fromEntries(cols.map((c) => [c.name, c]));
    expect(byName.mfa_secret).toMatchObject({ type: 'text', isNullable: true });
    expect(byName.mfa_enabled_at).toMatchObject({
      type: 'timestamptz',
      isNullable: true,
    });
    expect(byName.mfa_failed_attempts).toMatchObject({
      type: 'integer',
      default: 0,
      isNullable: false,
    });
    expect(byName.mfa_recovery_failures).toMatchObject({
      type: 'integer',
      default: 0,
      isNullable: false,
    });
  });

  it('drops the same columns on down', async () => {
    const { qr, dropColumns } = recorder();
    await new AccountantMfa1792600000000().down(qr);
    const [table, cols] = dropColumns.mock.calls[0] as [string, TableColumn[]];
    expect(table).toBe('accountants');
    expect(cols.map((c) => c.name)).toEqual(NAMES);
  });
});
