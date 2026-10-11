import type { MigrationInterface, QueryRunner } from 'typeorm';

export class Invoices1791100000000 implements MigrationInterface {
  name = 'Invoices1791100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "companies"
        ADD COLUMN "iban" varchar(34),
        ADD COLUMN "bank_name" text,
        ADD COLUMN "email" text,
        ADD COLUMN "phone" varchar(30),
        ADD COLUMN "logo" bytea,
        ADD COLUMN "logo_content_type" varchar(20)
    `);
    await queryRunner.query(`
      CREATE TABLE "invoices" (
        "id" integer GENERATED ALWAYS AS IDENTITY NOT NULL,
        "accountant_id" integer NOT NULL,
        "company_id" integer NOT NULL,
        "series" varchar(10) NOT NULL,
        "number" integer NOT NULL,
        "issue_date" date NOT NULL,
        "delivery_date" date NOT NULL,
        "due_date" date,
        "currency" varchar(3) NOT NULL DEFAULT 'RON',
        "exchange_rate" numeric(12,6),
        "payment_method" varchar(20) NOT NULL DEFAULT 'transfer',
        "vat_on_collection" boolean NOT NULL DEFAULT false,
        "seller" jsonb NOT NULL,
        "buyer" jsonb NOT NULL,
        "lines" jsonb NOT NULL,
        "vat_breakdown" jsonb NOT NULL,
        "total_net" numeric(14,2) NOT NULL,
        "total_vat" numeric(14,2) NOT NULL,
        "total_gross" numeric(14,2) NOT NULL,
        "total_vat_ron" numeric(14,2) NOT NULL,
        "notes" text,
        "storage_path" text,
        "emailed_to" text,
        "emailed_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "invoices_pkey" PRIMARY KEY ("id"),
        CONSTRAINT "uq_invoices_company_series_number" UNIQUE ("company_id", "series", "number"),
        CONSTRAINT "fk_invoices_accountant" FOREIGN KEY ("accountant_id") REFERENCES "accountants" ("id") ON DELETE CASCADE,
        CONSTRAINT "fk_invoices_company" FOREIGN KEY ("company_id") REFERENCES "companies" ("id") ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_invoices_accountant_issued" ON "invoices" ("accountant_id", "issue_date" DESC, "id" DESC)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "invoices"`);
    await queryRunner.query(`
      ALTER TABLE "companies"
        DROP COLUMN "iban",
        DROP COLUMN "bank_name",
        DROP COLUMN "email",
        DROP COLUMN "phone",
        DROP COLUMN "logo",
        DROP COLUMN "logo_content_type"
    `);
  }
}
