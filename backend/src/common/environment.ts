import type { ConfigService } from '@nestjs/config';
import { NodeEnv } from '../config/dto/env.enums.js';

export function isProduction(config: ConfigService): boolean {
  return config.get('NODE_ENV') === NodeEnv.Production;
}
