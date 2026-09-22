import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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
>;

@Injectable()
export class ApiLogsService {
  private readonly logger = new Logger(ApiLogsService.name);

  constructor(
    @InjectRepository(ApiLog) private readonly logs: Repository<ApiLog>,
  ) {}

  /** Never throws: a failed audit write must not fail the ANAF call. */
  async record(entry: ApiLogEntry): Promise<void> {
    try {
      await this.logs.insert(entry);
    } catch (err) {
      this.logger.error(`Could not write api_log: ${String(err)}`);
    }
  }
}
