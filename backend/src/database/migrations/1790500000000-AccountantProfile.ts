import { TableCheck, TableColumn } from 'typeorm';
import type { MigrationInterface, QueryRunner } from 'typeorm';

const columns = [
  new TableColumn({
    name: 'phone',
    type: 'varchar',
    length: '30',
    isNullable: true,
  }),
  new TableColumn({
    name: 'ceccar_member',
    type: 'boolean',
    isNullable: false,
    default: false,
  }),
  new TableColumn({
    name: 'professional_title',
    type: 'text',
    isNullable: true,
  }),
  new TableColumn({
    name: 'ceccar_number',
    type: 'varchar',
    length: '20',
    isNullable: true,
  }),
  new TableColumn({ name: 'ceccar_branch', type: 'text', isNullable: true }),
  new TableColumn({
    name: 'ccf_number',
    type: 'varchar',
    length: '20',
    isNullable: true,
  }),
  new TableColumn({ name: 'firm_name', type: 'text', isNullable: true }),
  new TableColumn({
    name: 'firm_cui',
    type: 'varchar',
    length: '10',
    isNullable: true,
  }),
];

const titleCheck = new TableCheck({
  name: 'accountants_professional_title_check',
  expression: "professional_title IN ('expert_contabil', 'contabil_autorizat')",
});

export class AccountantProfile1790500000000 implements MigrationInterface {
  name = 'AccountantProfile1790500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumns('accountants', columns);
    await queryRunner.createCheckConstraint('accountants', titleCheck);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropCheckConstraint('accountants', titleCheck);
    await queryRunner.dropColumns('accountants', [...columns].reverse());
  }
}
