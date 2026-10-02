import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AccountApproval1790700000000 implements MigrationInterface {
  name = 'AccountApproval1790700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "accountants" ADD "status" text NOT NULL DEFAULT 'active'`,
    );
    await queryRunner.query(
      `ALTER TABLE "accountants" ALTER COLUMN "status" SET DEFAULT 'pending'`,
    );
    await queryRunner.query(
      `ALTER TABLE "accountants" ADD CONSTRAINT "accountants_status_check" CHECK (status IN ('pending', 'active'))`,
    );
    await queryRunner.query(
      `ALTER TABLE "accountants" ADD "approval_token_hash" text`,
    );
    await queryRunner.query(
      `ALTER TABLE "accountants" ADD CONSTRAINT "accountants_approval_token_hash_key" UNIQUE ("approval_token_hash")`,
    );
    await queryRunner.query(
      `CREATE TABLE "banned_emails" (
        "id" integer GENERATED ALWAYS AS IDENTITY NOT NULL,
        "email" citext NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "banned_emails_pkey" PRIMARY KEY ("id"),
        CONSTRAINT "banned_emails_email_key" UNIQUE ("email")
      )`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "banned_emails"`);
    await queryRunner.query(
      `DELETE FROM "accountants" WHERE status = 'pending'`,
    );
    await queryRunner.query(
      `ALTER TABLE "accountants" DROP CONSTRAINT "accountants_approval_token_hash_key"`,
    );
    await queryRunner.query(
      `ALTER TABLE "accountants" DROP COLUMN "approval_token_hash"`,
    );
    await queryRunner.query(
      `ALTER TABLE "accountants" DROP CONSTRAINT "accountants_status_check"`,
    );
    await queryRunner.query(`ALTER TABLE "accountants" DROP COLUMN "status"`);
  }
}
