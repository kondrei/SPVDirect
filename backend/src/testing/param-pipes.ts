import { ROUTE_ARGS_METADATA } from '@nestjs/common/constants.js';

export function paramPipes(
  controller: abstract new (...args: never[]) => unknown,
  method: string,
  name: string,
): unknown[] {
  const args = (Reflect.getMetadata(ROUTE_ARGS_METADATA, controller, method) ??
    {}) as Record<string, { data?: unknown; pipes?: unknown[] }>;
  return Object.values(args).find((arg) => arg.data === name)?.pipes ?? [];
}
