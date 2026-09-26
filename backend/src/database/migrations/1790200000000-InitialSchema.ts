import {
  Table,
  TableCheck,
  TableForeignKey,
  TableIndex,
  TableUnique,
} from 'typeorm';
import type {
  MigrationInterface,
  QueryRunner,
  TableColumnOptions,
} from 'typeorm';

function id(table: string): TableColumnOptions {
  return {
    name: 'id',
    type: 'uuid',
    isPrimary: true,
    primaryKeyConstraintName: `${table}_pkey`,
    default: 'gen_random_uuid()',
  };
}

function timestamp(
  name: string,
  opts: { nullable?: boolean; defaultNow?: boolean } = {},
) {
  return {
    name,
    type: 'timestamptz',
    isNullable: opts.nullable ?? false,
    default: opts.defaultNow ? 'now()' : undefined,
  } satisfies TableColumnOptions;
}

function fk(
  table: string,
  column: string,
  referencedTable: string,
  onDelete: 'CASCADE' | 'SET NULL',
): TableForeignKey {
  return new TableForeignKey({
    name: `${table}_${column}_fkey`,
    columnNames: [column],
    referencedTableName: referencedTable,
    referencedColumnNames: ['id'],
    onDelete,
  });
}

export class InitialSchema1790200000000 implements MigrationInterface {
  name = 'InitialSchema1790200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS citext`);

    await queryRunner.createTable(
      new Table({
        name: 'accountants',
        columns: [
          id('accountants'),
          { name: 'email', type: 'citext' },
          { name: 'password_hash', type: 'text' },
          { name: 'name', type: 'text', isNullable: true },
          timestamp('created_at', { defaultNow: true }),
          timestamp('updated_at', { defaultNow: true }),
        ],
        uniques: [
          new TableUnique({
            name: 'accountants_email_key',
            columnNames: ['email'],
          }),
        ],
      }),
    );

    await queryRunner.createTable(
      new Table({
        name: 'anaf_connections',
        columns: [
          id('anaf_connections'),
          { name: 'accountant_id', type: 'uuid' },
          { name: 'label', type: 'text' },
          { name: 'cert_serial', type: 'text' },
          { name: 'roles', type: 'text', isArray: true, default: `'{}'` },
          { name: 'source', type: 'text' },
          { name: 'access_token_enc', type: 'text' },
          { name: 'refresh_token_enc', type: 'text' },
          timestamp('access_expires_at'),
          timestamp('refresh_expires_at'),
          timestamp('last_refreshed_at', { nullable: true }),
          { name: 'status', type: 'text', default: `'active'` },
          timestamp('created_at', { defaultNow: true }),
          timestamp('updated_at', { defaultNow: true }),
        ],
        uniques: [
          new TableUnique({
            name: 'uq_anaf_connections_accountant_serial',
            columnNames: ['accountant_id', 'cert_serial'],
          }),
        ],
        checks: [
          new TableCheck({
            name: 'anaf_connections_source_check',
            expression: `source IN ('self', 'link')`,
          }),
          new TableCheck({
            name: 'anaf_connections_status_check',
            expression: `status IN ('active', 'expired', 'revoked')`,
          }),
        ],
        foreignKeys: [
          fk('anaf_connections', 'accountant_id', 'accountants', 'CASCADE'),
        ],
        indices: [
          new TableIndex({
            name: 'idx_anaf_connections_accountant',
            columnNames: ['accountant_id'],
          }),
        ],
      }),
    );

    await queryRunner.createTable(
      new Table({
        name: 'companies',
        columns: [
          id('companies'),
          { name: 'accountant_id', type: 'uuid' },
          { name: 'cui', type: 'varchar', length: '20' },
          { name: 'name', type: 'text' },
          { name: 'anaf_connection_id', type: 'uuid', isNullable: true },
          timestamp('created_at', { defaultNow: true }),
          timestamp('updated_at', { defaultNow: true }),
        ],
        uniques: [
          new TableUnique({
            name: 'uq_companies_accountant_cui',
            columnNames: ['accountant_id', 'cui'],
          }),
        ],
        foreignKeys: [
          fk('companies', 'accountant_id', 'accountants', 'CASCADE'),
          fk('companies', 'anaf_connection_id', 'anaf_connections', 'SET NULL'),
        ],
      }),
    );

    await queryRunner.createTable(
      new Table({
        name: 'authorization_links',
        columns: [
          id('authorization_links'),
          { name: 'accountant_id', type: 'uuid' },
          { name: 'company_id', type: 'uuid' },
          { name: 'token_hash', type: 'text' },
          timestamp('expires_at'),
          timestamp('used_at', { nullable: true }),
          { name: 'anaf_connection_id', type: 'uuid', isNullable: true },
          timestamp('created_at', { defaultNow: true }),
        ],
        uniques: [
          new TableUnique({
            name: 'authorization_links_token_hash_key',
            columnNames: ['token_hash'],
          }),
        ],
        foreignKeys: [
          fk('authorization_links', 'accountant_id', 'accountants', 'CASCADE'),
          fk('authorization_links', 'company_id', 'companies', 'CASCADE'),
          fk(
            'authorization_links',
            'anaf_connection_id',
            'anaf_connections',
            'SET NULL',
          ),
        ],
        indices: [
          new TableIndex({
            name: 'idx_authorization_links_company',
            columnNames: ['company_id'],
          }),
        ],
      }),
    );

    await queryRunner.createTable(
      new Table({
        name: 'api_logs',
        columns: [
          id('api_logs'),
          { name: 'accountant_id', type: 'uuid' },
          { name: 'anaf_connection_id', type: 'uuid', isNullable: true },
          { name: 'company_id', type: 'uuid', isNullable: true },
          { name: 'service', type: 'text' },
          { name: 'method', type: 'varchar', length: '10' },
          { name: 'endpoint', type: 'text' },
          { name: 'status_code', type: 'int', isNullable: true },
          { name: 'response_time_ms', type: 'int' },
          { name: 'error', type: 'text', isNullable: true },
          timestamp('created_at', { defaultNow: true }),
        ],
        foreignKeys: [
          fk('api_logs', 'accountant_id', 'accountants', 'CASCADE'),
          fk('api_logs', 'anaf_connection_id', 'anaf_connections', 'SET NULL'),
          fk('api_logs', 'company_id', 'companies', 'SET NULL'),
        ],
        indices: [
          new TableIndex({
            name: 'idx_api_logs_accountant_created',
            columnNames: ['accountant_id', 'created_at'],
          }),
        ],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('api_logs');
    await queryRunner.dropTable('authorization_links');
    await queryRunner.dropTable('companies');
    await queryRunner.dropTable('anaf_connections');
    await queryRunner.dropTable('accountants');
  }
}
