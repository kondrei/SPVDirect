import { describe, expect, it, vi } from 'vitest';
import type { QueryRunner, TableCheck, TableColumn } from 'typeorm';
import { AccountantProfile1790500000000 } from './1790500000000-AccountantProfile.js';

function recorder() {
  const calls: string[] = [];
  const qr = {
    addColumns: vi.fn((table: string, cols: TableColumn[]) => {
      calls.push(`add ${table} ${cols.map(describeCol).join(', ')}`);
    }),
    dropColumns: vi.fn((table: string, cols: TableColumn[]) => {
      calls.push(`drop ${table} ${cols.map((c) => c.name).join(', ')}`);
    }),
    createCheckConstraint: vi.fn((table: string, check: TableCheck) => {
      calls.push(`check ${table} ${check.name}: ${check.expression}`);
    }),
    dropCheckConstraint: vi.fn((table: string, check: TableCheck) => {
      calls.push(`drop check ${table} ${check.name}`);
    }),
  } as unknown as QueryRunner;
  return { qr, calls };
}

const describeCol = (c: TableColumn) =>
  `${c.name} ${c.type}${c.length ? `(${c.length})` : ''}${c.isNullable ? ' null' : ''}${c.default !== undefined ? ` default ${String(c.default)}` : ''}`;

describe('AccountantProfile1790500000000', () => {
  it('adds the profile columns and the title check', async () => {
    const { qr, calls } = recorder();
    await new AccountantProfile1790500000000().up(qr);
    expect(calls).toEqual([
      'add accountants phone varchar(30) null, ceccar_member boolean default false, professional_title text null, ceccar_number varchar(20) null, ceccar_branch text null, ccf_number varchar(20) null, firm_name text null, firm_cui varchar(10) null',
      "check accountants accountants_professional_title_check: professional_title IN ('expert_contabil', 'contabil_autorizat')",
    ]);
  });

  it('drops the check, then the columns on down', async () => {
    const { qr, calls } = recorder();
    await new AccountantProfile1790500000000().down(qr);
    expect(calls).toEqual([
      'drop check accountants accountants_professional_title_check',
      'drop accountants firm_cui, firm_name, ccf_number, ceccar_branch, ceccar_number, professional_title, ceccar_member, phone',
    ]);
  });
});
