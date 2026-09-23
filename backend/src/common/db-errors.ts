import { QueryFailedError } from 'typeorm';

/** Postgres unique_violation (23505), e.g. two concurrent inserts of the same email or CUI. */
export function isUniqueViolation(err: unknown): boolean {
  return (
    err instanceof QueryFailedError &&
    (err.driverError as { code?: string } | undefined)?.code === '23505'
  );
}
