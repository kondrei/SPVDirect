import type { MigrationInterface, QueryRunner } from 'typeorm';

export class ApiLogSystemJobs1792500000000 implements MigrationInterface {
  name = 'ApiLogSystemJobs1792500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "api_logs" ALTER COLUMN "accountant_id" DROP NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM "api_logs" WHERE "accountant_id" IS NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "api_logs" ALTER COLUMN "accountant_id" SET NOT NULL`,
    );
  }
}
