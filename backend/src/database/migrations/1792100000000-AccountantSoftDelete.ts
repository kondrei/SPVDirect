import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AccountantSoftDelete1792100000000 implements MigrationInterface {
  name = 'AccountantSoftDelete1792100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "accountants" ADD COLUMN "deleted_at" timestamptz NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "accountants" DROP CONSTRAINT "accountants_email_key"`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "accountants_email_key" ON "accountants" ("email") WHERE "deleted_at" IS NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_accountants_deleted_at" ON "accountants" ("deleted_at") WHERE "deleted_at" IS NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "idx_accountants_deleted_at"`);
    await queryRunner.query(`DROP INDEX "accountants_email_key"`);
    await queryRunner.query(
      `ALTER TABLE "accountants" ADD CONSTRAINT "accountants_email_key" UNIQUE ("email")`,
    );
    await queryRunner.query(
      `ALTER TABLE "accountants" DROP COLUMN "deleted_at"`,
    );
  }
}
