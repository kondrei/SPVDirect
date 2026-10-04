import { TableColumn } from 'typeorm';
import type { MigrationInterface, QueryRunner } from 'typeorm';

const column = new TableColumn({
  name: 'storage_path',
  type: 'text',
  isNullable: true,
});

export class SpvMessageStoragePath1791000000000 implements MigrationInterface {
  name = 'SpvMessageStoragePath1791000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn('spv_messages', column);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('spv_messages', column);
  }
}
