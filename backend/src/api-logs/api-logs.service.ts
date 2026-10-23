import { Injectable, Logger } from '@nestjs/common';
import { ApiLogStream } from './api-log-stream.js';
import type { ApiLogEntry } from './dto/api-log.types.js';
import { ApiLogRepository } from './repositories/api-log.repository.js';

@Injectable()
export class ApiLogsService {
  private readonly logger = new Logger(ApiLogsService.name);

  constructor(
    private readonly apiLogRepository: ApiLogRepository,
    private readonly apiLogStream: ApiLogStream,
  ) {}

  async record(entry: ApiLogEntry): Promise<void> {
    this.apiLogStream.write(entry);
    try {
      await this.apiLogRepository.insert(entry);
    } catch (err) {
      this.logger.error(`Could not write api_log: ${String(err)}`);
    }
  }
}
