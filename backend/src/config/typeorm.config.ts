import type { DataSourceOptions } from 'typeorm';
import { Accountant } from '../accountants/accountant.entity.js';
import { AnafConnection } from '../anaf/anaf-connection.entity.js';
import { AuthorizationLink } from '../anaf/authorization-links/authorization-link.entity.js';
import { SpvMessage } from '../anaf/spv/spv-message.entity.js';
import { ApiLog } from '../api-logs/api-log.entity.js';
import { BannedEmail } from '../auth/banned-email.entity.js';
import { Company } from '../companies/company.entity.js';
import { migrations } from '../database/migrations/index.js';

export const entities = [
  Accountant,
  AnafConnection,
  AuthorizationLink,
  ApiLog,
  BannedEmail,
  Company,
  SpvMessage,
];

export function buildTypeOrmOptions(env: {
  DATABASE_URL: string;
  DATABASE_SSL: boolean | string;
}): DataSourceOptions {
  const ssl = env.DATABASE_SSL === true || env.DATABASE_SSL === 'true';
  return {
    type: 'postgres',
    url: env.DATABASE_URL,
    ssl: ssl ? { rejectUnauthorized: false } : false,
    entities,
    migrations,
    synchronize: false,
    migrationsRun: false,
  };
}
