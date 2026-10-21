import type { MigrationInterface, QueryRunner } from 'typeorm';

export class EfacturaInvoices1792400000000 implements MigrationInterface {
  name = 'EfacturaInvoices1792400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "efactura_invoices" (
        "id" integer GENERATED ALWAYS AS IDENTITY NOT NULL,
        "accountant_id" integer NOT NULL,
        "company_id" integer NOT NULL,
        "anaf_connection_id" integer,
        "environment" varchar(4) NOT NULL,
        "anaf_message_id" varchar(20) NOT NULL,
        "upload_index" varchar(20),
        "message_created_at" timestamptz,
        "direction" varchar(8) NOT NULL,
        "standard" varchar(4) NOT NULL,
        "type_code" varchar(3),
        "number" varchar(100),
        "issue_date" date,
        "due_date" date,
        "currency" varchar(3),
        "supplier_cui" varchar(32),
        "supplier_name" text,
        "customer_cui" varchar(32),
        "customer_name" text,
        "total_net" numeric(14,2),
        "total_vat" numeric(14,2),
        "total_gross" numeric(14,2),
        "lines" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "parse_error" text,
        "invoice_id" integer,
        "zip_content" bytea,
        "zip_storage_path" text,
        "pdf_content" bytea,
        "pdf_storage_path" text,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz,
        CONSTRAINT "efactura_invoices_pkey" PRIMARY KEY ("id"),
        CONSTRAINT "efactura_invoices_direction_check" CHECK ("direction" IN ('received', 'sent')),
        CONSTRAINT "efactura_invoices_environment_check" CHECK ("environment" IN ('test', 'prod')),
        CONSTRAINT "efactura_invoices_file_check" CHECK ("zip_content" IS NOT NULL OR "zip_storage_path" IS NOT NULL),
        CONSTRAINT "fk_efactura_invoices_accountant" FOREIGN KEY ("accountant_id") REFERENCES "accountants" ("id") ON DELETE CASCADE,
        CONSTRAINT "fk_efactura_invoices_company" FOREIGN KEY ("company_id") REFERENCES "companies" ("id") ON DELETE CASCADE,
        CONSTRAINT "fk_efactura_invoices_connection" FOREIGN KEY ("anaf_connection_id") REFERENCES "anaf_connections" ("id") ON DELETE SET NULL,
        CONSTRAINT "fk_efactura_invoices_invoice" FOREIGN KEY ("invoice_id") REFERENCES "invoices" ("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_efactura_invoices_message" ON "efactura_invoices" ("company_id", "environment", "anaf_message_id") WHERE "deleted_at" IS NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_efactura_invoices_list" ON "efactura_invoices" ("accountant_id", "company_id", "direction", "issue_date" DESC) WHERE "deleted_at" IS NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "efactura_invoices"`);
  }
}
