import type { MigrationInterface, QueryRunner } from 'typeorm';

interface Reference {
  table: string;
  column: string;
  constraint: string;
}

interface Target {
  table: string;
  references: Reference[];
}

const connectionReference = (table: string, constraint: string) => ({
  table,
  column: 'anaf_connection_id',
  constraint,
});

const targets: Target[] = [
  {
    table: 'anaf_connections',
    references: [
      connectionReference(
        'companies',
        'companies_anaf_connection_id_fkey',
      ),
      connectionReference(
        'authorization_links',
        'authorization_links_anaf_connection_id_fkey',
      ),
      connectionReference('api_logs', 'api_logs_anaf_connection_id_fkey'),
      connectionReference('spv_messages', 'fk_spv_messages_connection'),
      connectionReference('efactura_uploads', 'fk_efactura_uploads_connection'),
    ],
  },
  { table: 'authorization_links', references: [] },
  { table: 'api_logs', references: [] },
];

export class IntegerUuidIds1791900000000 implements MigrationInterface {
  name = 'IntegerUuidIds1791900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const target of targets) {
      await convert(queryRunner, target, {
        type: 'integer',
        fill: `SELECT id, row_number() OVER (ORDER BY created_at, id) AS new_id FROM "${target.table}"`,
      });
      await queryRunner.query(
        `ALTER TABLE "${target.table}" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY`,
      );
      await queryRunner.query(
        `SELECT setval(pg_get_serial_sequence('${target.table}', 'id'), COALESCE(MAX("id"), 0) + 1, false) FROM "${target.table}"`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const target of [...targets].reverse()) {
      await queryRunner.query(
        `ALTER TABLE "${target.table}" ALTER COLUMN "id" DROP IDENTITY IF EXISTS`,
      );
      await convert(queryRunner, target, {
        type: 'uuid',
        fill: `SELECT id, gen_random_uuid() AS new_id FROM "${target.table}"`,
      });
      await queryRunner.query(
        `ALTER TABLE "${target.table}" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()`,
      );
    }
  }
}

async function convert(
  queryRunner: QueryRunner,
  { table, references }: Target,
  { type, fill }: { type: 'integer' | 'uuid'; fill: string },
): Promise<void> {
  for (const ref of references) {
    await queryRunner.query(
      `ALTER TABLE "${ref.table}" DROP CONSTRAINT "${ref.constraint}"`,
    );
  }
  await queryRunner.query(
    `ALTER TABLE "${table}" DROP CONSTRAINT "${table}_pkey"`,
  );

  await queryRunner.query(`ALTER TABLE "${table}" ADD COLUMN "new_id" ${type}`);
  await queryRunner.query(
    `UPDATE "${table}" t SET "new_id" = m.new_id FROM (${fill}) m WHERE t.id = m.id`,
  );
  for (const ref of references) {
    await queryRunner.query(
      `ALTER TABLE "${ref.table}" ADD COLUMN "new_${ref.column}" ${type}`,
    );
    await queryRunner.query(
      `UPDATE "${ref.table}" r SET "new_${ref.column}" = p.new_id FROM "${table}" p WHERE r.${ref.column} = p.id`,
    );
  }

  await queryRunner.query(`ALTER TABLE "${table}" DROP COLUMN "id"`);
  await queryRunner.query(
    `ALTER TABLE "${table}" RENAME COLUMN "new_id" TO "id"`,
  );
  await queryRunner.query(
    `ALTER TABLE "${table}" ALTER COLUMN "id" SET NOT NULL`,
  );
  await queryRunner.query(
    `ALTER TABLE "${table}" ADD CONSTRAINT "${table}_pkey" PRIMARY KEY ("id")`,
  );

  for (const ref of references) {
    await queryRunner.query(
      `ALTER TABLE "${ref.table}" DROP COLUMN "${ref.column}"`,
    );
    await queryRunner.query(
      `ALTER TABLE "${ref.table}" RENAME COLUMN "new_${ref.column}" TO "${ref.column}"`,
    );
    await queryRunner.query(
      `ALTER TABLE "${ref.table}" ADD CONSTRAINT "${ref.constraint}" FOREIGN KEY ("${ref.column}") REFERENCES "${table}"("id") ON DELETE SET NULL`,
    );
  }
}
