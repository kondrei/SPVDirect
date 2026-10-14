import { TableColumn } from 'typeorm';
import type { MigrationInterface, QueryRunner } from 'typeorm';

const columns = [
  new TableColumn({
    name: 'token_call_at',
    type: 'timestamptz',
    isNullable: true,
  }),
  new TableColumn({
    name: 'refresh_started_at',
    type: 'timestamptz',
    isNullable: true,
  }),
  new TableColumn({
    name: 'denied_with_fresh_token_at',
    type: 'timestamptz',
    isNullable: true,
  }),
];

export class AnafConnectionTokenState1791800000000 implements MigrationInterface {
  name = 'AnafConnectionTokenState1791800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumns('anaf_connections', columns);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumns('anaf_connections', columns);
  }
}
