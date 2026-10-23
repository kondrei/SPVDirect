import type { ApiLogsService } from './api-logs.service.js';
import type { ApiCallOutcome, ApiCallTarget } from './dto/api-log.types.js';

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
