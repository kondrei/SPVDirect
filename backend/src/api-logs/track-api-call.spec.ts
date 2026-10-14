import { trackApiCall } from './track-api-call.js';

const target = {
  accountantId: 1,
  anafConnectionId: null,
  companyId: null,
  service: 'X',
  method: 'GET',
  endpoint: '/x',
};

describe('trackApiCall', () => {
  it('records the outcome the call reported, with its duration', async () => {
    const record = vi.fn().mockResolvedValue(undefined);
    await expect(
      trackApiCall({ record }, target, (outcome) => {
        outcome.statusCode = 201;
        return Promise.resolve('done');
      }),
    ).resolves.toBe('done');
    expect(record).toHaveBeenCalledWith({
      ...target,
      statusCode: 201,
      error: null,
      responseTimeMs: expect.any(Number),
    });
  });

  it('still records when the call throws', async () => {
    const record = vi.fn().mockResolvedValue(undefined);
    await expect(
      trackApiCall({ record }, target, (outcome) => {
        outcome.error = 'ECONNRESET';
        return Promise.reject(new Error('boom'));
      }),
    ).rejects.toThrow('boom');
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: null, error: 'ECONNRESET' }),
    );
  });
});
