import { TableColumn } from 'typeorm';
import type { MigrationInterface, QueryRunner } from 'typeorm';

const column = new TableColumn({
  name: 'firm_caen_code',
  type: 'varchar',
  length: '10',
  isNullable: true,
});

export class AccountantFirmCaen1790600000000 implements MigrationInterface {
  name = 'AccountantFirmCaen1790600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn('accountants', column);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('accountants', column);
  }
}
