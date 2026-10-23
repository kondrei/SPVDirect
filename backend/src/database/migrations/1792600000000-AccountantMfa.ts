import { TableColumn } from 'typeorm';
import type { MigrationInterface, QueryRunner } from 'typeorm';

const columns = [
  new TableColumn({ name: 'mfa_secret', type: 'text', isNullable: true }),
  new TableColumn({
    name: 'mfa_enabled_at',
    type: 'timestamptz',
    isNullable: true,
  }),
  new TableColumn({
    name: 'mfa_changed_at',
    type: 'timestamptz',
    isNullable: true,
  }),
  new TableColumn({
    name: 'mfa_last_used_step',
    type: 'integer',
    isNullable: true,
  }),
  new TableColumn({
    name: 'mfa_failed_attempts',
    type: 'integer',
    default: 0,
  }),
  new TableColumn({
    name: 'mfa_locked_until',
    type: 'timestamptz',
    isNullable: true,
  }),
  new TableColumn({
    name: 'mfa_recovery_hash',
    type: 'text',
    isNullable: true,
  }),
  new TableColumn({
    name: 'mfa_recovery_failures',
    type: 'integer',
    default: 0,
  }),
];

export class AccountantMfa1792600000000 implements MigrationInterface {
  name = 'AccountantMfa1792600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumns('accountants', columns);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumns('accountants', columns);
  }
}
