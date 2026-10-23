import type { Repository } from 'typeorm';
import type { ApiLogStream } from './api-log-stream.js';
import type { ApiLog } from './api-log.entity.js';
import { ApiLogsService } from './api-logs.service.js';
import type { ApiLogEntry } from './dto/api-log.types.js';
import { ApiLogRepository } from './repositories/api-log.repository.js';

const ENTRY: ApiLogEntry = {
  accountantId: 1,
  anafConnectionId: 4,
  companyId: null,
  service: 'SMTP',
  method: 'SEND',
  endpoint: 'invoice',
  statusCode: 250,
  responseTimeMs: 40,
  error: null,
  details: { to: 'client@example.com' },
};

function setup() {
  const repo = { insert: vi.fn().mockResolvedValue(undefined) };
  const stream = { write: vi.fn() };
  const service = new ApiLogsService(
    new ApiLogRepository(repo as unknown as Repository<ApiLog>),
    stream as unknown as ApiLogStream,
  );
  return { service, repo, stream };
}

describe('ApiLogsService.record', () => {
  it('stores the call in api_logs and writes it to the log stream', async () => {
    const { service, repo, stream } = setup();
    await service.record(ENTRY);
    expect(repo.insert).toHaveBeenCalledWith(ENTRY);
    expect(stream.write).toHaveBeenCalledWith(ENTRY);
  });

  it('still streams the call and never throws when the insert fails', async () => {
    const { service, repo, stream } = setup();
    repo.insert.mockRejectedValue(new Error('db down'));
    await expect(service.record(ENTRY)).resolves.toBeUndefined();
    expect(stream.write).toHaveBeenCalledWith(ENTRY);
  });
});
