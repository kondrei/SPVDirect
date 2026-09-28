import { BadGatewayException } from '@nestjs/common';
import type { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { AxiosError } from 'axios';
import type { ApiLogsService } from '../api-logs/api-logs.service.js';
import { anafTvaRecord } from '../testing/anaf-tva-record.js';
import {
  AnafCompanyLookupService,
  MAX_CUIS_PER_REQUEST,
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

    await service.lookup(1, '12345678');

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
    await expect(service.lookup(1, '12345678')).resolves.toEqual(
      anafTvaRecord(12345678),
    );
  });

  it('matches a CUI typed with a leading zero to ANAF’s numeric cui', async () => {
    const { service, post } = setup();
    post.mockResolvedValue({
      status: 200,
      data: { found: [anafTvaRecord(123)], notFound: [] },
    });
    await expect(service.lookup(1, '0123')).resolves.toEqual(
      anafTvaRecord(123),
    );
  });

  it('returns null when the CUI is in notFound', async () => {
    const { service, post } = setup();
    post.mockResolvedValue({
      status: 200,
      data: { found: [], notFound: [12345678] },
    });
    await expect(service.lookup(1, '12345678')).resolves.toBeNull();
  });

  it('audits the call in api_logs without a connection', async () => {
    const { service, post, record } = setup();
    post.mockResolvedValue({ status: 200, data: { found: [], notFound: [] } });
    await service.lookup(1, '12345678', 7);
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({
        accountantId: 1,
        anafConnectionId: null,
        companyId: 7,
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
    await expect(service.lookup(1, '12345678')).rejects.toBeInstanceOf(
      BadGatewayException,
    );
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 500, error: 'HTTP 500' }),
    );
  });

  it('maps a 200 without found[] to 502', async () => {
    const { service, post } = setup();
    post.mockResolvedValue({ status: 200, data: '<html>maintenance</html>' });
    await expect(service.lookup(1, '12345678')).rejects.toBeInstanceOf(
      BadGatewayException,
    );
  });

  it('maps a network failure to 502', async () => {
    const { service, post, record } = setup();
    post.mockRejectedValue(new AxiosError('timeout', 'ECONNABORTED'));
    await expect(service.lookup(1, '12345678')).rejects.toThrow(/nu răspunde/);
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
      service.lookup(1, '11'),
      service.lookup(1, '22'),
      service.lookup(1, '33'),
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

    const first = service.lookup(1, '11').catch((e: unknown) => e);
    const second = service.lookup(1, '22');
    await vi.runAllTimersAsync();
    expect(await first).toBeInstanceOf(BadGatewayException);
    await expect(second).resolves.toBeNull();
  });
});

describe('AnafCompanyLookupService.lookupMany', () => {
  afterEach(() => vi.useRealTimers());

  it('sends up to 100 CUIs per request and merges the found records', async () => {
    vi.useFakeTimers();
    const { service, post, record } = setup();
    post.mockImplementation((_url: string, body: { cui: number }[]) =>
      Promise.resolve({
        status: 200,
        data: {
          found: body
            .filter((b) => b.cui % 2 === 0)
            .map((b) => anafTvaRecord(b.cui)),
          notFound: body.filter((b) => b.cui % 2 !== 0).map((b) => b.cui),
        },
      }),
    );
    const cuis = Array.from({ length: MAX_CUIS_PER_REQUEST + 5 }, (_, i) =>
      String(10 + i),
    );

    const pending = service.lookupMany(1, cuis);
    await vi.runAllTimersAsync();
    const found = await pending;

    expect(post).toHaveBeenCalledTimes(2);
    expect(post.mock.calls[0][1]).toHaveLength(MAX_CUIS_PER_REQUEST);
    expect(post.mock.calls[1][1]).toHaveLength(5);
    expect(record).toHaveBeenCalledTimes(2);
    expect(found.size).toBe(Math.ceil(cuis.length / 2));
    expect(found.get(10)).toEqual(anafTvaRecord(10));
    expect(found.has(11)).toBe(false);
  });

  it('ignores records for CUIs that were not asked for', async () => {
    const { service, post } = setup();
    post.mockResolvedValue({
      status: 200,
      data: { found: [anafTvaRecord(12), anafTvaRecord(99)], notFound: [] },
    });
    const found = await service.lookupMany(1, ['12']);
    expect([...found.keys()]).toEqual([12]);
  });

  it('fails the whole lookup when one request fails', async () => {
    const { service, post } = setup();
    post.mockResolvedValue({ status: 503, data: '' });
    await expect(service.lookupMany(1, ['12'])).rejects.toBeInstanceOf(
      BadGatewayException,
    );
  });
});
