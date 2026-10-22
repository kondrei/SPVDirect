import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ApiLogStream } from './api-log-stream.js';
import { ApiLog } from './api-log.entity.js';

export type ApiLogEntry = Pick<
  ApiLog,
  | 'accountantId'
  | 'anafConnectionId'
  | 'companyId'
  | 'service'
  | 'method'
  | 'endpoint'
  | 'statusCode'
  | 'responseTimeMs'
  | 'error'
> &
  Partial<Pick<ApiLog, 'details'>>;

@Injectable()
export class ApiLogsService {
  private readonly logger = new Logger(ApiLogsService.name);

  constructor(
    @InjectRepository(ApiLog) private readonly logs: Repository<ApiLog>,
    private readonly stream: ApiLogStream,
  ) {}

  async record(entry: ApiLogEntry): Promise<void> {
    this.stream.write(entry);
    try {
      await this.logs.insert(entry);
    } catch (err) {
      this.logger.error(`Could not write api_log: ${String(err)}`);
    }
  }
}
