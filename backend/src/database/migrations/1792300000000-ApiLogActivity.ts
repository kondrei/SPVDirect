import type { MigrationInterface, QueryRunner } from 'typeorm';

export class ApiLogActivity1792300000000 implements MigrationInterface {
  name = 'ApiLogActivity1792300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "api_logs" ADD "description" text`);
    await queryRunner.query(`ALTER TABLE "api_logs" ADD "details" jsonb`);
    await queryRunner.query(
      `ALTER TABLE "api_logs" ALTER COLUMN "response_time_ms" DROP NOT NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_api_logs_activity" ON "api_logs" ("accountant_id", "created_at" DESC, "id" DESC) WHERE "service" = 'ACTIVITY'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "idx_api_logs_activity"`);
    await queryRunner.query(
      `DELETE FROM "api_logs" WHERE "service" = 'ACTIVITY'`,
    );
    await queryRunner.query(
      `ALTER TABLE "api_logs" ALTER COLUMN "response_time_ms" SET NOT NULL`,
    );
    await queryRunner.query(`ALTER TABLE "api_logs" DROP COLUMN "details"`);
    await queryRunner.query(`ALTER TABLE "api_logs" DROP COLUMN "description"`);
  }
}
