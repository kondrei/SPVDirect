import type { MigrationInterface, QueryRunner } from 'typeorm';

interface Reference {
  table: string;
  column: string;
  nullable: boolean;
  onDelete: 'CASCADE' | 'SET NULL';
}

interface Target {
  table: string;
  references: Reference[];
  restore: string[];
}

const targets: Target[] = [
  {
    table: 'companies',
    references: [
      {
        table: 'authorization_links',
        column: 'company_id',
        nullable: false,
        onDelete: 'CASCADE',
      },
      {
        table: 'api_logs',
        column: 'company_id',
        nullable: true,
        onDelete: 'SET NULL',
      },
    ],
    restore: [
      `CREATE INDEX "idx_authorization_links_company" ON "authorization_links" ("company_id")`,
    ],
  },
  {
    table: 'accountants',
    references: [
      'anaf_connections',
      'companies',
      'authorization_links',
      'api_logs',
    ].map((table) => ({
      table,
      column: 'accountant_id',
      nullable: false,
      onDelete: 'CASCADE' as const,
    })),
    restore: [
      `ALTER TABLE "anaf_connections" ADD CONSTRAINT "uq_anaf_connections_accountant_serial" UNIQUE ("accountant_id", "cert_serial")`,
      `CREATE INDEX "idx_anaf_connections_accountant" ON "anaf_connections" ("accountant_id")`,
      `ALTER TABLE "companies" ADD CONSTRAINT "uq_companies_accountant_cui" UNIQUE ("accountant_id", "cui")`,
      `CREATE INDEX "idx_api_logs_accountant_created" ON "api_logs" ("accountant_id", "created_at")`,
    ],
  },
];

export class IntegerIds1790400000000 implements MigrationInterface {
  name = 'IntegerIds1790400000000';

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
  { table, references, restore }: Target,
  { type, fill }: { type: 'integer' | 'uuid'; fill: string },
): Promise<void> {
  for (const ref of references) {
    await queryRunner.query(
      `ALTER TABLE "${ref.table}" DROP CONSTRAINT "${ref.table}_${ref.column}_fkey"`,
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
    if (!ref.nullable) {
      await queryRunner.query(
        `ALTER TABLE "${ref.table}" ALTER COLUMN "${ref.column}" SET NOT NULL`,
      );
    }
    await queryRunner.query(
      `ALTER TABLE "${ref.table}" ADD CONSTRAINT "${ref.table}_${ref.column}_fkey" FOREIGN KEY ("${ref.column}") REFERENCES "${table}"("id") ON DELETE ${ref.onDelete}`,
    );
  }
  for (const statement of restore) await queryRunner.query(statement);
}
