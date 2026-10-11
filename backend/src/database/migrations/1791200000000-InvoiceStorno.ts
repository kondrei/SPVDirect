import type { MigrationInterface, QueryRunner } from 'typeorm';

export class InvoiceStorno1791200000000 implements MigrationInterface {
  name = 'InvoiceStorno1791200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "invoices"
        ADD COLUMN "storno_of_invoice_id" integer,
        ADD COLUMN "storno_of_series" varchar(10),
        ADD COLUMN "storno_of_number" integer,
        ADD COLUMN "storno_of_issue_date" date,
        ADD CONSTRAINT "fk_invoices_storno_of" FOREIGN KEY ("storno_of_invoice_id") REFERENCES "invoices" ("id") ON DELETE RESTRICT
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_invoices_storno_of" ON "invoices" ("storno_of_invoice_id") WHERE "storno_of_invoice_id" IS NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "idx_invoices_storno_of"`);
    await queryRunner.query(`
      ALTER TABLE "invoices"
        DROP CONSTRAINT "fk_invoices_storno_of",
        DROP COLUMN "storno_of_invoice_id",
        DROP COLUMN "storno_of_series",
        DROP COLUMN "storno_of_number",
        DROP COLUMN "storno_of_issue_date"
    `);
  }
}
