import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ApiLog } from './api-log.entity.js';
import { ApiLogsService } from './api-logs.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([ApiLog])],
  providers: [ApiLogsService],
  exports: [ApiLogsService],
})
export class ApiLogsModule {}
