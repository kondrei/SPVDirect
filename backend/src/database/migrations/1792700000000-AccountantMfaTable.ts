import type { MigrationInterface, QueryRunner } from 'typeorm';

const MOVED_COLUMNS = [
  'mfa_secret',
  'mfa_enabled_at',
  'mfa_last_used_step',
  'mfa_failed_attempts',
  'mfa_locked_until',
  'mfa_recovery_hash',
  'mfa_recovery_failures',
].map((column) => 'DROP COLUMN "' + column + '"');

export class AccountantMfaTable1792700000000 implements MigrationInterface {
  name = 'AccountantMfaTable1792700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "accountant_mfa" (
        "accountant_id" integer NOT NULL,
        "secret" text,
        "app_enabled_at" timestamptz,
        "email_enabled_at" timestamptz,
        "last_used_step" integer,
        "failed_attempts" integer NOT NULL DEFAULT 0,
        "locked_until" timestamptz,
        "recovery_hash" text,
        "recovery_failures" integer NOT NULL DEFAULT 0,
        "email_code_hash" text,
        "email_code_expires_at" timestamptz,
        "email_code_sent_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "accountant_mfa_pkey" PRIMARY KEY ("accountant_id"),
        CONSTRAINT "fk_accountant_mfa_accountant" FOREIGN KEY ("accountant_id") REFERENCES "accountants" ("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      INSERT INTO "accountant_mfa" ("accountant_id", "secret", "app_enabled_at", "last_used_step", "failed_attempts", "locked_until", "recovery_hash", "recovery_failures")
      SELECT "id", "mfa_secret", "mfa_enabled_at", "mfa_last_used_step", "mfa_failed_attempts", "mfa_locked_until", "mfa_recovery_hash", "mfa_recovery_failures"
      FROM "accountants"
      WHERE "mfa_secret" IS NOT NULL OR "mfa_enabled_at" IS NOT NULL OR "mfa_recovery_hash" IS NOT NULL
    `);
    await queryRunner.query(
      `ALTER TABLE "accountants" ${MOVED_COLUMNS.join(', ')}`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "accountants"
        ADD COLUMN "mfa_secret" text,
        ADD COLUMN "mfa_enabled_at" timestamptz,
        ADD COLUMN "mfa_last_used_step" integer,
        ADD COLUMN "mfa_failed_attempts" integer NOT NULL DEFAULT 0,
        ADD COLUMN "mfa_locked_until" timestamptz,
        ADD COLUMN "mfa_recovery_hash" text,
        ADD COLUMN "mfa_recovery_failures" integer NOT NULL DEFAULT 0
    `);
    await queryRunner.query(`
      UPDATE "accountants" a
      SET "mfa_secret" = m."secret", "mfa_enabled_at" = m."app_enabled_at",
          "mfa_last_used_step" = m."last_used_step", "mfa_failed_attempts" = m."failed_attempts",
          "mfa_locked_until" = m."locked_until",
          "mfa_recovery_hash" = CASE WHEN m."app_enabled_at" IS NULL THEN NULL ELSE m."recovery_hash" END,
          "mfa_recovery_failures" = m."recovery_failures"
      FROM "accountant_mfa" m
      WHERE m."accountant_id" = a."id"
    `);
    await queryRunner.query(`DROP TABLE "accountant_mfa"`);
  }
}
