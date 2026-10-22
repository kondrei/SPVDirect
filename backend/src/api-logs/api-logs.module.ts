import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ActivityLogsController } from './activity-logs.controller.js';
import { ActivityLogsService } from './activity-logs.service.js';
import { ApiLogStream } from './api-log-stream.js';
import { ApiLog } from './api-log.entity.js';
import { ApiLogsService } from './api-logs.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([ApiLog])],
  controllers: [ActivityLogsController],
  providers: [ApiLogStream, ApiLogsService, ActivityLogsService],
  exports: [ApiLogsService, ActivityLogsService],
})
export class ApiLogsModule {}
