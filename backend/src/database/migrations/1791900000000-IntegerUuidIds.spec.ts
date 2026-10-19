import { describe, expect, it } from 'vitest';
import type { QueryRunner } from 'typeorm';
import { IntegerUuidIds1791900000000 } from './1791900000000-IntegerUuidIds.js';

async function sqlOf(step: 'up' | 'down'): Promise<string[]> {
  const sql: string[] = [];
  const qr = {
    query: (q: string) => {
      sql.push(q);
      return Promise.resolve([]);
    },
  } as unknown as QueryRunner;
  await new IntegerUuidIds1791900000000()[step](qr);
  return sql;
}

const indexOf = (sql: string[], fragment: string) => {
  const i = sql.findIndex((q) => q.includes(fragment));
  expect(i, fragment).toBeGreaterThanOrEqual(0);
  return i;
};

const tables = ['anaf_connections', 'authorization_links', 'api_logs'];

const connectionReferences = [
  ['companies', 'companies_anaf_connection_id_fkey'],
  ['authorization_links', 'authorization_links_anaf_connection_id_fkey'],
  ['api_logs', 'api_logs_anaf_connection_id_fkey'],
  ['spv_messages', 'fk_spv_messages_connection'],
  ['efactura_uploads', 'fk_efactura_uploads_connection'],
];

describe('IntegerUuidIds1791900000000', () => {
  it.each(tables)(
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

  it.each(connectionReferences)(
    'remaps connection ids in %s before dropping the old id',
    async (ref, constraint) => {
      const sql = await sqlOf('up');
      const dropOldId = indexOf(
        sql,
        'ALTER TABLE "anaf_connections" DROP COLUMN "id"',
      );
      expect(
        indexOf(sql, `ALTER TABLE "${ref}" DROP CONSTRAINT "${constraint}"`),
      ).toBeLessThan(dropOldId);
      expect(
        indexOf(
          sql,
          `UPDATE "${ref}" r SET "new_anaf_connection_id" = p.new_id FROM "anaf_connections" p`,
        ),
      ).toBeLessThan(dropOldId);
      expect(sql).toContain(
        `ALTER TABLE "${ref}" ADD CONSTRAINT "${constraint}" FOREIGN KEY ("anaf_connection_id") REFERENCES "anaf_connections"("id") ON DELETE SET NULL`,
      );
      expect(
        indexOf(sql, `ALTER TABLE "${ref}" ADD CONSTRAINT "${constraint}"`),
      ).toBeGreaterThan(dropOldId);
    },
  );

  it('keeps every connection reference nullable', async () => {
    const sql = (await sqlOf('up')).join('\n');
    expect(sql).not.toContain('"anaf_connection_id" SET NOT NULL');
  });

  it('converts anaf_connections before authorization_links, whose connection column it rewrites', async () => {
    const sql = await sqlOf('up');
    expect(
      indexOf(sql, 'ALTER TABLE "anaf_connections" DROP COLUMN "id"'),
    ).toBeLessThan(
      indexOf(sql, 'ALTER TABLE "authorization_links" DROP COLUMN "id"'),
    );
  });

  it.each(tables)(
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

  it('goes back to random UUIDs on down, api_logs first', async () => {
    const sql = await sqlOf('down');
    expect(sql[0]).toBe(
      'ALTER TABLE "api_logs" ALTER COLUMN "id" DROP IDENTITY IF EXISTS',
    );
    for (const table of tables) {
      expect(sql).toContain(`ALTER TABLE "${table}" ADD COLUMN "new_id" uuid`);
    }
    expect(sql).toContain(
      'ALTER TABLE "spv_messages" ADD COLUMN "new_anaf_connection_id" uuid',
    );
    expect(sql.at(-1)).toBe(
      'ALTER TABLE "anaf_connections" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()',
    );
  });
});
