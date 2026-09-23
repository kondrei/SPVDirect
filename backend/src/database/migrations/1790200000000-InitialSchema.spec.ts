import { describe, expect, it } from 'vitest';
import { DataSource, Table } from 'typeorm';
import type { QueryRunner } from 'typeorm';
import { InitialSchema1790200000000 } from './1790200000000-InitialSchema.js';

/**
 * Runs the migration against a Postgres query runner whose execution is stubbed out,
 * so we can assert the generated SQL without a database.
 */
async function generatedSql(): Promise<string[]> {
  const ds = new DataSource({
    type: 'postgres',
    url: 'postgres://u@localhost/db',
  });
  const qr = ds.driver.createQueryRunner('master') as QueryRunner & {
    createTableSql(table: Table, createForeignKeys: boolean): { query: string };
    createIndexSql(
      table: Table,
      index: Table['indices'][number],
    ): { query: string };
  };
  const sql: string[] = [];
  qr.query = (async (q: string) => {
    sql.push(q);
    return [];
  }) as QueryRunner['query'];
  qr.createTable = async (table: Table) => {
    sql.push(qr.createTableSql(table, true).query);
    for (const index of table.indices)
      sql.push(qr.createIndexSql(table, index).query.trim());
  };
  await new InitialSchema1790200000000().up(qr);
  return sql;
}

describe('InitialSchema1790200000000', () => {
  it('creates citext first, then the tables in FK order', async () => {
    const sql = await generatedSql();
    expect(sql[0]).toBe('CREATE EXTENSION IF NOT EXISTS citext');
    const tables = sql
      .map((q) => /^CREATE TABLE "(\w+)"/.exec(q)?.[1])
      .filter((t): t is string => !!t);
    expect(tables).toEqual([
      'accountants',
      'anaf_connections',
      'companies',
      'authorization_links',
      'api_logs',
    ]);
  });

  it('keeps the Postgres-default constraint names and the entity unique names', async () => {
    const all = (await generatedSql()).join('\n');
    for (const name of [
      'accountants_pkey',
      'accountants_email_key',
      'uq_anaf_connections_accountant_serial',
      'uq_companies_accountant_cui',
      'authorization_links_token_hash_key',
      'anaf_connections_source_check',
      'anaf_connections_status_check',
      'companies_anaf_connection_id_fkey',
    ]) {
      expect(all).toContain(`CONSTRAINT "${name}"`);
    }
  });

  it('generates the column types, defaults and FK actions', async () => {
    const all = (await generatedSql()).join('\n');
    expect(all).toContain('"id" uuid NOT NULL DEFAULT gen_random_uuid()');
    expect(all).toContain('"email" citext NOT NULL');
    expect(all).toContain(`"roles" text array NOT NULL DEFAULT '{}'`);
    expect(all).toContain(`"status" text NOT NULL DEFAULT 'active'`);
    expect(all).toContain('"cui" varchar(20) NOT NULL');
    expect(all).toContain('"last_refreshed_at" timestamptz,');
    expect(all).toContain('"created_at" timestamptz NOT NULL DEFAULT now()');
    expect(all).toContain(
      'FOREIGN KEY ("company_id") REFERENCES "companies" ("id") ON DELETE CASCADE',
    );
    expect(all).toContain(
      'FOREIGN KEY ("anaf_connection_id") REFERENCES "anaf_connections" ("id") ON DELETE SET NULL',
    );
  });

  it('creates the three indexes', async () => {
    const indexes = (await generatedSql()).filter((q) =>
      q.startsWith('CREATE INDEX'),
    );
    expect(indexes).toEqual([
      'CREATE INDEX "idx_anaf_connections_accountant" ON "anaf_connections"  ("accountant_id")',
      'CREATE INDEX "idx_authorization_links_company" ON "authorization_links"  ("company_id")',
      'CREATE INDEX "idx_api_logs_accountant_created" ON "api_logs"  ("accountant_id", "created_at")',
    ]);
  });
});
