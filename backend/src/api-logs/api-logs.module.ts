import { Module } from '@nestjs/common';
import { ActivityLogsController } from './activity-logs.controller.js';
import { ActivityLogsService } from './activity-logs.service.js';
import { ApiLogStream } from './api-log-stream.js';
import { ApiLogsService } from './api-logs.service.js';

@Module({
  controllers: [ActivityLogsController],
  providers: [ApiLogStream, ApiLogsService, ActivityLogsService],
  exports: [ApiLogsService, ActivityLogsService],
})
export class ApiLogsModule {}
