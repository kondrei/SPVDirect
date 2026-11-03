import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AccountantMfaRequest1792800000000 implements MigrationInterface {
  name = 'AccountantMfaRequest1792800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "accountant_mfa"
        ADD COLUMN "requested_method" text,
        ADD CONSTRAINT "accountant_mfa_requested_method_check" CHECK ("requested_method" IN ('app', 'email'))
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "accountant_mfa"
        DROP CONSTRAINT "accountant_mfa_requested_method_check",
        DROP COLUMN "requested_method"
    `);
  }
}
