import type { MigrationInterface, QueryRunner } from 'typeorm';

export const SOFT_DELETED_TABLES = [
  'companies',
  'invoices',
  'efactura_uploads',
  'spv_messages',
];

export class CompanySoftDelete1792000000000 implements MigrationInterface {
  name = 'CompanySoftDelete1792000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const table of SOFT_DELETED_TABLES) {
      await queryRunner.query(
        `ALTER TABLE "${table}" ADD COLUMN "deleted_at" timestamptz NULL`,
      );
    }
    await queryRunner.query(
      `ALTER TABLE "companies" DROP CONSTRAINT "uq_companies_accountant_cui"`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_companies_accountant_cui" ON "companies" ("accountant_id", "cui") WHERE "deleted_at" IS NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "spv_messages" DROP CONSTRAINT "uq_spv_messages_accountant_message"`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uq_spv_messages_accountant_message" ON "spv_messages" ("accountant_id", "anaf_message_id") WHERE "deleted_at" IS NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_companies_deleted_at" ON "companies" ("deleted_at") WHERE "deleted_at" IS NOT NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_efactura_uploads_company" ON "efactura_uploads" ("company_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_spv_messages_company" ON "spv_messages" ("company_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "idx_spv_messages_company"`);
    await queryRunner.query(`DROP INDEX "idx_efactura_uploads_company"`);
    await queryRunner.query(`DROP INDEX "idx_companies_deleted_at"`);
    await queryRunner.query(`DROP INDEX "uq_spv_messages_accountant_message"`);
    await queryRunner.query(
      `ALTER TABLE "spv_messages" ADD CONSTRAINT "uq_spv_messages_accountant_message" UNIQUE ("accountant_id", "anaf_message_id")`,
    );
    await queryRunner.query(`DROP INDEX "uq_companies_accountant_cui"`);
    await queryRunner.query(
      `ALTER TABLE "companies" ADD CONSTRAINT "uq_companies_accountant_cui" UNIQUE ("accountant_id", "cui")`,
    );
    for (const table of [...SOFT_DELETED_TABLES].reverse()) {
      await queryRunner.query(
        `ALTER TABLE "${table}" DROP COLUMN "deleted_at"`,
      );
    }
  }
}
