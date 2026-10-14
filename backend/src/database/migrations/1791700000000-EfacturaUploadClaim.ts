import type { MigrationInterface, QueryRunner } from 'typeorm';

export class EfacturaUploadClaim1791700000000 implements MigrationInterface {
  name = 'EfacturaUploadClaim1791700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_efactura_uploads_invoice_active" ON "efactura_uploads" ("invoice_id") WHERE "invoice_id" IS NOT NULL AND "status" IN ('sending', 'processing', 'ok')`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "uq_efactura_uploads_invoice_active"`);
  }
}
