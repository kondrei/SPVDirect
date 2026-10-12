import { Controller, Get, Header } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { PUBLIC_STATS_THROTTLE } from '../common/constants.js';
import { PublicStatsService } from './public-stats.service.js';

@Controller('public')
export class PublicStatsController {
  constructor(private readonly stats: PublicStatsService) {}

  @Get('stats')
  @Throttle(PUBLIC_STATS_THROTTLE)
  @Header('Cache-Control', 'no-cache')
  getStats() {
    return this.stats.getStats();
  }
}
