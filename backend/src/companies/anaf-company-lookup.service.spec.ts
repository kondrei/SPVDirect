import { BadGatewayException } from '@nestjs/common';
import type { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { AxiosError } from 'axios';
import type { ApiLogsService } from '../api-logs/api-logs.service.js';
import { anafTvaRecord } from '../testing/anaf-tva-record.js';
import {
  AnafCompanyLookupService,
  MIN_INTERVAL_MS,
} from './anaf-company-lookup.service.js';

const ENDPOINT = 'https://webservicesp.anaf.ro/api/PlatitorTvaRest/v9/tva';

function setup() {
  const post = vi.fn();
  const record = vi.fn().mockResolvedValue(undefined);
  const service = new AnafCompanyLookupService(
    new ConfigService({ ANAF_TVA_ENDPOINT: ENDPOINT }),
    { axiosRef: { post } } as unknown as HttpService,
    { record } as unknown as ApiLogsService,
  );
  return { service, post, record };
}

describe('AnafCompanyLookupService', () => {
  afterEach(() => vi.useRealTimers());

  it('posts the CUI as a number with today’s Bucharest date', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-25T22:30:00Z'));
    const { service, post } = setup();
    post.mockResolvedValue({ status: 200, data: { found: [], notFound: [] } });

    await service.lookup('acc-1', '12345678');

    expect(post).toHaveBeenCalledWith(
      ENDPOINT,
      [{ cui: 12345678, data: '2026-09-26' }],
      expect.objectContaining({ timeout: 30_000 }),
    );
  });

  it('returns the matching found record', async () => {
    const { service, post } = setup();
    post.mockResolvedValue({
      status: 200,
      data: { found: [anafTvaRecord(12345678)], notFound: [] },
    });
    await expect(service.lookup('acc-1', '12345678')).resolves.toEqual(
      anafTvaRecord(12345678),
    );
  });

  it('matches a CUI typed with a leading zero to ANAF’s numeric cui', async () => {
    const { service, post } = setup();
    post.mockResolvedValue({
      status: 200,
      data: { found: [anafTvaRecord(123)], notFound: [] },
    });
    await expect(service.lookup('acc-1', '0123')).resolves.toEqual(
      anafTvaRecord(123),
    );
  });

  it('returns null when the CUI is in notFound', async () => {
    const { service, post } = setup();
    post.mockResolvedValue({
      status: 200,
      data: { found: [], notFound: [12345678] },
    });
    await expect(service.lookup('acc-1', '12345678')).resolves.toBeNull();
  });

  it('audits the call in api_logs without a connection', async () => {
    const { service, post, record } = setup();
    post.mockResolvedValue({ status: 200, data: { found: [], notFound: [] } });
    await service.lookup('acc-1', '12345678', 'co-1');
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({
        accountantId: 'acc-1',
        anafConnectionId: null,
        companyId: 'co-1',
        service: 'PlatitorTva',
        method: 'POST',
        endpoint: '/api/PlatitorTvaRest/v9/tva',
        statusCode: 200,
        error: null,
      }),
    );
  });

  it('maps an HTTP error to 502 and logs it', async () => {
    const { service, post, record } = setup();
    post.mockResolvedValue({ status: 500, data: 'oops' });
    await expect(service.lookup('acc-1', '12345678')).rejects.toBeInstanceOf(
      BadGatewayException,
    );
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 500, error: 'HTTP 500' }),
    );
  });

  it('maps a 200 without found[] to 502', async () => {
    const { service, post } = setup();
    post.mockResolvedValue({ status: 200, data: '<html>maintenance</html>' });
    await expect(service.lookup('acc-1', '12345678')).rejects.toBeInstanceOf(
      BadGatewayException,
    );
  });

  it('maps a network failure to 502', async () => {
    const { service, post, record } = setup();
    post.mockRejectedValue(new AxiosError('timeout', 'ECONNABORTED'));
    await expect(service.lookup('acc-1', '12345678')).rejects.toThrow(
      /nu răspunde/,
    );
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: null, error: 'ECONNABORTED' }),
    );
  });

  it('spaces calls at least one second apart', async () => {
    vi.useFakeTimers();
    const { service, post } = setup();
    const at: number[] = [];
    post.mockImplementation(() => {
      at.push(Date.now());
      return Promise.resolve({ status: 200, data: { found: [] } });
    });

    const all = Promise.all([
      service.lookup('acc-1', '11'),
      service.lookup('acc-1', '22'),
      service.lookup('acc-1', '33'),
    ]);
    await vi.runAllTimersAsync();
    await all;

    expect(at).toHaveLength(3);
    expect(at[1] - at[0]).toBeGreaterThanOrEqual(MIN_INTERVAL_MS);
    expect(at[2] - at[1]).toBeGreaterThanOrEqual(MIN_INTERVAL_MS);
  });

  it('keeps going after a failed call', async () => {
    vi.useFakeTimers();
    const { service, post } = setup();
    post
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce({ status: 200, data: { found: [] } });

    const first = service.lookup('acc-1', '11').catch((e: unknown) => e);
    const second = service.lookup('acc-1', '22');
    await vi.runAllTimersAsync();
    expect(await first).toBeInstanceOf(BadGatewayException);
    await expect(second).resolves.toBeNull();
  });
});
