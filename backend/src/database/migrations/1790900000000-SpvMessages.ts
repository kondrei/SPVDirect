import type { MigrationInterface, QueryRunner } from 'typeorm';

export class SpvMessages1790900000000 implements MigrationInterface {
  name = 'SpvMessages1790900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "spv_messages" (
        "id" integer GENERATED ALWAYS AS IDENTITY NOT NULL,
        "accountant_id" integer NOT NULL,
        "anaf_connection_id" uuid,
        "company_id" integer,
        "anaf_message_id" varchar(30) NOT NULL,
        "cif" varchar(20),
        "type" text,
        "details" text,
        "request_id" varchar(30),
        "anaf_created_at" timestamptz,
        "anaf_created_raw" varchar(30),
        "content" bytea,
        "content_type" text,
        "size_bytes" integer,
        "downloaded_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "spv_messages_pkey" PRIMARY KEY ("id"),
        CONSTRAINT "uq_spv_messages_accountant_message" UNIQUE ("accountant_id", "anaf_message_id"),
        CONSTRAINT "fk_spv_messages_accountant" FOREIGN KEY ("accountant_id") REFERENCES "accountants" ("id") ON DELETE CASCADE,
        CONSTRAINT "fk_spv_messages_connection" FOREIGN KEY ("anaf_connection_id") REFERENCES "anaf_connections" ("id") ON DELETE SET NULL,
        CONSTRAINT "fk_spv_messages_company" FOREIGN KEY ("company_id") REFERENCES "companies" ("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_spv_messages_accountant_created" ON "spv_messages" ("accountant_id", "anaf_created_at" DESC)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "spv_messages"`);
  }
}
