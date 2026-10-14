import type { ApiLogEntry, ApiLogsService } from './api-logs.service.js';

export type ApiCallTarget = Omit<
  ApiLogEntry,
  'statusCode' | 'responseTimeMs' | 'error'
>;

export interface ApiCallOutcome {
  statusCode: number | null;
  error: string | null;
}

export async function trackApiCall<T>(
  apiLogs: Pick<ApiLogsService, 'record'>,
  target: ApiCallTarget,
  call: (outcome: ApiCallOutcome) => Promise<T>,
): Promise<T> {
  const started = performance.now();
  const outcome: ApiCallOutcome = { statusCode: null, error: null };
  try {
    return await call(outcome);
  } finally {
    await apiLogs.record({
      ...target,
      ...outcome,
      responseTimeMs: Math.round(performance.now() - started),
    });
  }
}
