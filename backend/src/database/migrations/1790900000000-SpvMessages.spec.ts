import { describe, expect, it, vi } from 'vitest';
import type { QueryRunner } from 'typeorm';
import { SpvMessages1790900000000 } from './1790900000000-SpvMessages.js';

describe('SpvMessages1790900000000', () => {
  it('creates spv_messages with a per-accountant unique message id', async () => {
    const query = vi.fn();
    await new SpvMessages1790900000000().up({
      query,
    } as unknown as QueryRunner);
    const sql = query.mock.calls.map((c) => String(c[0])).join('\n');
    expect(sql).toContain('CREATE TABLE "spv_messages"');
    expect(sql).toContain('UNIQUE ("accountant_id", "anaf_message_id")');
    expect(sql).toContain('"content" bytea');
    expect(sql).toContain('ON DELETE CASCADE');
    expect(sql).toContain('CREATE INDEX "idx_spv_messages_accountant_created"');
  });

  it('drops the table on down', async () => {
    const query = vi.fn();
    await new SpvMessages1790900000000().down({
      query,
    } as unknown as QueryRunner);
    expect(query).toHaveBeenCalledWith('DROP TABLE "spv_messages"');
  });
});
