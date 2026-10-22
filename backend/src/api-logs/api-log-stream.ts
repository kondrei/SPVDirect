import { Injectable, Logger } from '@nestjs/common';
import type { ApiLogRow } from './dto/api-log.types.js';

@Injectable()
export class ApiLogStream {
  private readonly logger = new Logger('ApiLog');

  write(row: ApiLogRow): void {
    const entry = {
      message: `${row.service} ${row.method} ${row.endpoint}`,
      ...row,
    };
    if (row.error) this.logger.warn(entry);
    else this.logger.log(entry);
  }
}
