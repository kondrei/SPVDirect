import { describe, expect, it } from 'vitest';
import type { QueryRunner } from 'typeorm';
import { IntegerIds1790400000000 } from './1790400000000-IntegerIds.js';

async function sqlOf(step: 'up' | 'down'): Promise<string[]> {
  const sql: string[] = [];
  const qr = {
    query: (q: string) => {
      sql.push(q);
      return Promise.resolve([]);
    },
  } as unknown as QueryRunner;
  await new IntegerIds1790400000000()[step](qr);
  return sql;
}

const indexOf = (sql: string[], fragment: string) => {
  const i = sql.findIndex((q) => q.includes(fragment));
  expect(i, fragment).toBeGreaterThanOrEqual(0);
  return i;
};

describe('IntegerIds1790400000000', () => {
  it.each(['companies', 'accountants'])(
    'numbers existing %s from 1 in creation order',
    async (table) => {
      const sql = await sqlOf('up');
      expect(sql).toContain(
        `ALTER TABLE "${table}" ADD COLUMN "new_id" integer`,
      );
      expect(sql).toContain(
        `UPDATE "${table}" t SET "new_id" = m.new_id FROM (SELECT id, row_number() OVER (ORDER BY created_at, id) AS new_id FROM "${table}") m WHERE t.id = m.id`,
      );
    },
  );

  it.each([
    ['companies', 'authorization_links', 'company_id'],
    ['companies', 'api_logs', 'company_id'],
    ['accountants', 'anaf_connections', 'accountant_id'],
    ['accountants', 'companies', 'accountant_id'],
    ['accountants', 'authorization_links', 'accountant_id'],
    ['accountants', 'api_logs', 'accountant_id'],
  ])(
    'remaps %s ids in %s.%s before dropping the old id',
    async (table, ref, column) => {
      const sql = await sqlOf('up');
      const dropOldId = indexOf(sql, `ALTER TABLE "${table}" DROP COLUMN "id"`);
      expect(
        indexOf(sql, `DROP CONSTRAINT "${ref}_${column}_fkey"`),
      ).toBeLessThan(dropOldId);
      expect(
        indexOf(sql, `UPDATE "${ref}" r SET "new_${column}"`),
      ).toBeLessThan(dropOldId);
      expect(
        indexOf(sql, `ADD CONSTRAINT "${ref}_${column}_fkey"`),
      ).toBeGreaterThan(dropOldId);
    },
  );

  it('keeps the FK delete rules and nullability of each reference', async () => {
    const sql = (await sqlOf('up')).join('\n');
    expect(sql).not.toContain(
      'ALTER TABLE "api_logs" ALTER COLUMN "company_id" SET NOT NULL',
    );
    expect(sql).toMatch(
      /"authorization_links_company_id_fkey".*ON DELETE CASCADE/,
    );
    expect(sql).toMatch(/"api_logs_company_id_fkey".*ON DELETE SET NULL/);
    for (const t of [
      'anaf_connections',
      'companies',
      'authorization_links',
      'api_logs',
    ]) {
      expect(sql).toContain(
        `ALTER TABLE "${t}" ALTER COLUMN "accountant_id" SET NOT NULL`,
      );
      expect(sql).toMatch(
        new RegExp(`"${t}_accountant_id_fkey".*ON DELETE CASCADE`),
      );
    }
  });

  it('recreates the indexes and unique constraints that used the old columns', async () => {
    const sql = (await sqlOf('up')).join('\n');
    for (const name of [
      'idx_authorization_links_company',
      'uq_anaf_connections_accountant_serial',
      'idx_anaf_connections_accountant',
      'uq_companies_accountant_cui',
      'idx_api_logs_accountant_created',
    ]) {
      expect(sql).toContain(`"${name}"`);
    }
  });

  it.each(['companies', 'accountants'])(
    'makes %s.id an identity that continues after the highest id',
    async (table) => {
      const sql = await sqlOf('up');
      const pkey = indexOf(
        sql,
        `ALTER TABLE "${table}" ADD CONSTRAINT "${table}_pkey" PRIMARY KEY ("id")`,
      );
      const identity = indexOf(
        sql,
        `ALTER TABLE "${table}" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY`,
      );
      const setval = indexOf(
        sql,
        `setval(pg_get_serial_sequence('${table}', 'id'), COALESCE(MAX("id"), 0) + 1, false)`,
      );
      expect(pkey).toBeLessThan(identity);
      expect(identity).toBeLessThan(setval);
    },
  );

  it('goes back to random UUIDs on down, accountants first', async () => {
    const sql = await sqlOf('down');
    expect(sql[0]).toBe(
      'ALTER TABLE "accountants" ALTER COLUMN "id" DROP IDENTITY IF EXISTS',
    );
    expect(sql).toContain('ALTER TABLE "companies" ADD COLUMN "new_id" uuid');
    expect(sql).toContain(
      'ALTER TABLE "anaf_connections" ADD COLUMN "new_accountant_id" uuid',
    );
    expect(sql.at(-1)).toBe(
      'ALTER TABLE "companies" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()',
    );
  });
});
