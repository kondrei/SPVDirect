import { describe, expect, it, vi } from 'vitest';
import type { QueryRunner, TableColumn } from 'typeorm';
import { CompanyAnafData1790300000000 } from './1790300000000-CompanyAnafData.js';

function recorder() {
  const addColumns = vi.fn();
  const dropColumns = vi.fn();
  const qr = { addColumns, dropColumns } as unknown as QueryRunner;
  return { qr, addColumns, dropColumns };
}

const describeCol = (c: TableColumn) =>
  `${c.name} ${c.type}${c.length ? `(${c.length})` : ''}${c.isNullable ? ' null' : ''}`;

describe('CompanyAnafData1790300000000', () => {
  it('adds the nullable ANAF columns to companies', async () => {
    const { qr, addColumns } = recorder();
    await new CompanyAnafData1790300000000().up(qr);

    expect(addColumns).toHaveBeenCalledOnce();
    const [table, cols] = addColumns.mock.calls[0] as [string, TableColumn[]];
    expect(table).toBe('companies');
    expect(cols.map(describeCol)).toEqual([
      'reg_com text null',
      'address text null',
      'caen_code varchar(10) null',
      'registration_status text null',
      'vat_payer boolean null',
      'vat_on_collection boolean null',
      'split_vat boolean null',
      'e_factura boolean null',
      'inactive boolean null',
      'anaf_data jsonb null',
      'anaf_synced_at timestamptz null',
    ]);
  });

  it('drops the same columns on down', async () => {
    const { qr, addColumns, dropColumns } = recorder();
    const migration = new CompanyAnafData1790300000000();
    await migration.up(qr);
    await migration.down(qr);

    const added = (addColumns.mock.calls[0][1] as TableColumn[]).map(
      (c) => c.name,
    );
    const [table, dropped] = dropColumns.mock.calls[0] as [
      string,
      TableColumn[],
    ];
    expect(table).toBe('companies');
    expect(dropped.map((c) => c.name).sort()).toEqual([...added].sort());
  });
});
