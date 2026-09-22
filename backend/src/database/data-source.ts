// Entry point for the TypeORM CLI. Runs from the compiled output:
//   npm run migration:run   (builds first, then uses dist/database/data-source.js)
import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { buildTypeOrmOptions } from '../config/typeorm.config.js';

try {
  process.loadEnvFile('.env');
} catch {
  // No .env file: rely on the real environment.
}

const { DATABASE_URL, DATABASE_SSL = 'true' } = process.env;
if (!DATABASE_URL) {
  throw new Error('DATABASE_URL is not set');
}

export default new DataSource(
  buildTypeOrmOptions({ DATABASE_URL, DATABASE_SSL }),
);
