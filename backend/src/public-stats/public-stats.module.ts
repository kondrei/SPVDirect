import { Module } from '@nestjs/common';
import { PublicStatsController } from './public-stats.controller.js';
import { PublicStatsService } from './public-stats.service.js';
import { PublicStatsSubscriber } from './public-stats.subscriber.js';

@Module({
  imports: [],
  controllers: [PublicStatsController],
  providers: [PublicStatsService, PublicStatsSubscriber],
})
export class PublicStatsModule {}
