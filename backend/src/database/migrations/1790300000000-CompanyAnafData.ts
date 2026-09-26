import { TableColumn } from 'typeorm';
import type { MigrationInterface, QueryRunner } from 'typeorm';

const columns = [
  new TableColumn({ name: 'reg_com', type: 'text', isNullable: true }),
  new TableColumn({ name: 'address', type: 'text', isNullable: true }),
  new TableColumn({
    name: 'caen_code',
    type: 'varchar',
    length: '10',
    isNullable: true,
  }),
  new TableColumn({
    name: 'registration_status',
    type: 'text',
    isNullable: true,
  }),
  new TableColumn({ name: 'vat_payer', type: 'boolean', isNullable: true }),
  new TableColumn({
    name: 'vat_on_collection',
    type: 'boolean',
    isNullable: true,
  }),
  new TableColumn({ name: 'split_vat', type: 'boolean', isNullable: true }),
  new TableColumn({ name: 'e_factura', type: 'boolean', isNullable: true }),
  new TableColumn({ name: 'inactive', type: 'boolean', isNullable: true }),
  new TableColumn({ name: 'anaf_data', type: 'jsonb', isNullable: true }),
  new TableColumn({
    name: 'anaf_synced_at',
    type: 'timestamptz',
    isNullable: true,
  }),
];

export class CompanyAnafData1790300000000 implements MigrationInterface {
  name = 'CompanyAnafData1790300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumns('companies', columns);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumns('companies', [...columns].reverse());
  }
}
