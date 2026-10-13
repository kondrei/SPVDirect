import type { MigrationInterface, QueryRunner } from 'typeorm';

export class InvoiceAccountantBuyerIndex1791600000000 implements MigrationInterface {
  name = 'InvoiceAccountantBuyerIndex1791600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE INDEX "idx_invoices_accountant_buyer_cui" ON "invoices" ("accountant_id", ("buyer" ->> 'cui'), "issue_date" DESC, "id" DESC) WHERE "storno_of_invoice_id" IS NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "idx_invoices_accountant_buyer_cui"`);
  }
}
