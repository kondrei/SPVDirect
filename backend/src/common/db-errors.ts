import { QueryFailedError } from 'typeorm';
import { PostgresErrorCode } from './dto/common.enums.js';

export function isUniqueViolation(err: unknown): boolean {
  return (
    err instanceof QueryFailedError &&
    (err.driverError as { code?: string } | undefined)?.code ===
      PostgresErrorCode.UniqueViolation
  );
}

export function isForeignKeyViolation(err: unknown): boolean {
  return (
    err instanceof QueryFailedError &&
    (err.driverError as { code?: string } | undefined)?.code ===
      PostgresErrorCode.ForeignKeyViolation
  );
}
