import { Logger } from '@nestjs/common';
import { ApiLogStream } from './api-log-stream.js';
import type { ApiLogRow } from './dto/api-log.types.js';

const ROW: ApiLogRow = {
  accountantId: 1,
  anafConnectionId: 4,
  companyId: 7,
  service: 'ANAF',
  method: 'GET',
  endpoint: '/test/FCTEL/rest/stareMesaj',
  statusCode: 200,
  responseTimeMs: 85,
  error: null,
};

describe('ApiLogStream', () => {
  afterEach(() => vi.restoreAllMocks());

  it('logs the row as structured fields under the ApiLog context', () => {
    const log = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    new ApiLogStream().write(ROW);
    expect(log).toHaveBeenCalledWith({
      message: 'ANAF GET /test/FCTEL/rest/stareMesaj',
      ...ROW,
    });
    expect(log.mock.contexts[0]).toMatchObject({ context: 'ApiLog' });
  });

  it('logs a row with an error as a warning', () => {
    const log = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    const warn = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => {});
    new ApiLogStream().write({ ...ROW, statusCode: 503, error: 'down' });
    expect(log).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 503, error: 'down' }),
    );
  });
});
