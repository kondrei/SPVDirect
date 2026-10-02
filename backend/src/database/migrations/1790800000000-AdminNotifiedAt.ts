import { TableColumn } from 'typeorm';
import type { MigrationInterface, QueryRunner } from 'typeorm';

const column = new TableColumn({
  name: 'admin_notified_at',
  type: 'timestamptz',
  isNullable: true,
});

export class AdminNotifiedAt1790800000000 implements MigrationInterface {
  name = 'AdminNotifiedAt1790800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn('accountants', column);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('accountants', column);
  }
}
