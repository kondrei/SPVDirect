import type { NestApplicationOptions } from '@nestjs/common';
import { readFileSync } from 'node:fs';
import type { Env } from './env.validation.js';

export function loadHttpsOptions(
  env: Partial<Pick<Env, 'HTTPS_KEY_FILE' | 'HTTPS_CERT_FILE'>>,
): NestApplicationOptions['httpsOptions'] {
  if (!env.HTTPS_KEY_FILE || !env.HTTPS_CERT_FILE) return undefined;
  return {
    key: readFileSync(env.HTTPS_KEY_FILE),
    cert: readFileSync(env.HTTPS_CERT_FILE),
  };
}
