import { format } from 'winston';
import {
  DROPPED_LOG_KEYS,
  LOG_TEXT_MASKS,
  REDACTED,
  REDACTED_LOG_KEYS,
} from '../constants.js';

export function maskText(text: string): string {
  return LOG_TEXT_MASKS.reduce(
    (masked, [pattern, replacement]) => masked.replace(pattern, replacement),
    text,
  );
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

export function redactValue(key: string, value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (REDACTED_LOG_KEYS.has(key)) return REDACTED;
  if (typeof value === 'string') return maskText(value);
  if (Array.isArray(value)) return value.map((item) => redactValue('', item));
  if (isPlainObject(value)) return redactObject(value);
  return value;
}

export function redactObject(
  value: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !DROPPED_LOG_KEYS.has(key))
      .map(([key, item]) => [key, redactValue(key, item)]),
  );
}

export const redact = format((info) => {
  for (const key of Object.keys(info)) {
    if (DROPPED_LOG_KEYS.has(key)) delete info[key];
    else info[key] = redactValue(key, info[key]);
  }
  return info;
});
