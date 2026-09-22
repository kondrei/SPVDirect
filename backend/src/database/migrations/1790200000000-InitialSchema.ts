import type { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1790200000000 implements MigrationInterface {
  name = 'InitialSchema1790200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS citext`);

    await queryRunner.query(`
      CREATE TABLE accountants (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        email citext NOT NULL UNIQUE,
        password_hash text NOT NULL,
        name text,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )`);

    await queryRunner.query(`
      CREATE TABLE anaf_connections (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        accountant_id uuid NOT NULL REFERENCES accountants(id) ON DELETE CASCADE,
        label text NOT NULL,
        cert_serial text NOT NULL,
        roles text[] NOT NULL DEFAULT '{}',
        source text NOT NULL CHECK (source IN ('self', 'link')),
        access_token_enc text NOT NULL,
        refresh_token_enc text NOT NULL,
        access_expires_at timestamptz NOT NULL,
        refresh_expires_at timestamptz NOT NULL,
        last_refreshed_at timestamptz,
        status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'revoked')),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT uq_anaf_connections_accountant_serial UNIQUE (accountant_id, cert_serial)
      )`);

    await queryRunner.query(`
      CREATE TABLE companies (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        accountant_id uuid NOT NULL REFERENCES accountants(id) ON DELETE CASCADE,
        cui varchar(20) NOT NULL,
        name text NOT NULL,
        anaf_connection_id uuid REFERENCES anaf_connections(id) ON DELETE SET NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT uq_companies_accountant_cui UNIQUE (accountant_id, cui)
      )`);

    await queryRunner.query(`
      CREATE TABLE authorization_links (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        accountant_id uuid NOT NULL REFERENCES accountants(id) ON DELETE CASCADE,
        company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        token_hash text NOT NULL UNIQUE,
        expires_at timestamptz NOT NULL,
        used_at timestamptz,
        anaf_connection_id uuid REFERENCES anaf_connections(id) ON DELETE SET NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      )`);

    await queryRunner.query(`
      CREATE TABLE api_logs (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        accountant_id uuid NOT NULL REFERENCES accountants(id) ON DELETE CASCADE,
        anaf_connection_id uuid REFERENCES anaf_connections(id) ON DELETE SET NULL,
        company_id uuid REFERENCES companies(id) ON DELETE SET NULL,
        service text NOT NULL,
        method varchar(10) NOT NULL,
        endpoint text NOT NULL,
        status_code int,
        response_time_ms int NOT NULL,
        error text,
        created_at timestamptz NOT NULL DEFAULT now()
      )`);

    await queryRunner.query(
      `CREATE INDEX idx_anaf_connections_accountant ON anaf_connections (accountant_id)`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_authorization_links_company ON authorization_links (company_id)`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_api_logs_accountant_created ON api_logs (accountant_id, created_at DESC)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE api_logs`);
    await queryRunner.query(`DROP TABLE authorization_links`);
    await queryRunner.query(`DROP TABLE companies`);
    await queryRunner.query(`DROP TABLE anaf_connections`);
    await queryRunner.query(`DROP TABLE accountants`);
  }
}
