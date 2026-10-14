import type { ConfigService } from '@nestjs/config';

export function isProduction(config: ConfigService): boolean {
  return config.get('NODE_ENV') === 'production';
}
