import type { MigrationInterface, QueryRunner } from 'typeorm';

export class InvoiceBuyerIndex1791500000000 implements MigrationInterface {
  name = 'InvoiceBuyerIndex1791500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE INDEX "idx_invoices_company_buyer_cui" ON "invoices" ("company_id", ("buyer" ->> 'cui'), "issue_date" DESC, "id" DESC) WHERE "storno_of_invoice_id" IS NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "idx_invoices_company_buyer_cui"`);
  }
}
