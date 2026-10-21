import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AccountantDeletedStatus1792200000000 implements MigrationInterface {
  name = 'AccountantDeletedStatus1792200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "accountants" DROP CONSTRAINT "accountants_status_check"`,
    );
    await queryRunner.query(
      `ALTER TABLE "accountants" ADD CONSTRAINT "accountants_status_check" CHECK (status IN ('pending', 'active', 'deleted'))`,
    );
    await queryRunner.query(
      `UPDATE "accountants" SET "status" = 'deleted' WHERE "deleted_at" IS NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "accountants" SET "status" = 'active' WHERE "status" = 'deleted'`,
    );
    await queryRunner.query(
      `ALTER TABLE "accountants" DROP CONSTRAINT "accountants_status_check"`,
    );
    await queryRunner.query(
      `ALTER TABLE "accountants" ADD CONSTRAINT "accountants_status_check" CHECK (status IN ('pending', 'active'))`,
    );
  }
}
