import type { MigrationInterface, QueryRunner } from 'typeorm';

export class EfacturaUploads1791300000000 implements MigrationInterface {
  name = 'EfacturaUploads1791300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "efactura_uploads" (
        "id" integer GENERATED ALWAYS AS IDENTITY NOT NULL,
        "accountant_id" integer NOT NULL,
        "company_id" integer NOT NULL,
        "invoice_id" integer,
        "anaf_connection_id" uuid,
        "environment" varchar(4) NOT NULL,
        "standard" varchar(4) NOT NULL,
        "upload_index" varchar(20),
        "status" varchar(12) NOT NULL,
        "download_id" varchar(20),
        "error_message" text,
        "checked_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "efactura_uploads_pkey" PRIMARY KEY ("id"),
        CONSTRAINT "fk_efactura_uploads_accountant" FOREIGN KEY ("accountant_id") REFERENCES "accountants" ("id") ON DELETE CASCADE,
        CONSTRAINT "fk_efactura_uploads_company" FOREIGN KEY ("company_id") REFERENCES "companies" ("id") ON DELETE CASCADE,
        CONSTRAINT "fk_efactura_uploads_invoice" FOREIGN KEY ("invoice_id") REFERENCES "invoices" ("id") ON DELETE SET NULL,
        CONSTRAINT "fk_efactura_uploads_connection" FOREIGN KEY ("anaf_connection_id") REFERENCES "anaf_connections" ("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_efactura_uploads_accountant" ON "efactura_uploads" ("accountant_id", "id" DESC)`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_efactura_uploads_invoice" ON "efactura_uploads" ("invoice_id") WHERE "invoice_id" IS NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "efactura_uploads"`);
  }
}
