import { NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants.js';
import type { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CAEN_CSV, CAEN_SEARCH } from '../testing/caen-csv.js';
import { CaenController } from './caen.controller.js';
import { CAEN_RETRY_MS, CAEN_TTL_MS, CaenService } from './caen.service.js';
import { DataGovRoService } from './data-gov-ro.service.js';

const API = 'https://data.gov.ro/api/3/action';
const isSearch = (url: string) => url.startsWith(`${API}/package_search?`);

function setup(
  get: (url: string) => Promise<unknown> = (url) =>
    Promise.resolve({ data: isSearch(url) ? CAEN_SEARCH : CAEN_CSV }),
) {
  const axiosGet = vi.fn(get);
  const service = new CaenService(
    new DataGovRoService(new ConfigService({ DATA_GOV_RO_API_URL: API }), {
      axiosRef: { get: axiosGet },
    } as unknown as HttpService),
  );
  return { service, axiosGet };
}

afterEach(() => vi.useRealTimers());

describe('CaenService', () => {
  it('downloads N_CAEN.CSV from the latest ONRC nomenclator dataset', async () => {
    const { service, axiosGet } = setup();
    await expect(service.describe('6920')).resolves.toMatchObject({
      code: '6920',
      revision: 3,
    });
    const [search, csv] = axiosGet.mock.calls.map(([url]) => new URL(url));
    expect(search.searchParams.get('q')).toBe('nomenclatoare');
    expect(search.searchParams.get('fq')).toBe('organization:onrc');
    expect(csv.href).toBe('https://example.test/n_caen.csv');
  });

  it('downloads once for concurrent and later calls within a day', async () => {
    const { service, axiosGet } = setup();
    await Promise.all([
      service.describe('6920'),
      service.describe('0111'),
      service.tryDescribe('6201'),
    ]);
    await service.describe('6210');
    expect(axiosGet).toHaveBeenCalledTimes(2);
  });

  it('downloads again after a day', async () => {
    vi.useFakeTimers();
    const { service, axiosGet } = setup();
    await service.describe('6920');
    vi.advanceTimersByTime(CAEN_TTL_MS + 1);
    await service.describe('6920');
    expect(axiosGet).toHaveBeenCalledTimes(4);
  });

  it('returns null for a code missing from the nomenclator', async () => {
    const { service } = setup();
    await expect(service.describe('0000')).resolves.toBeNull();
  });

  it('skips the download when there is no code', async () => {
    const { service, axiosGet } = setup();
    await expect(service.tryDescribe(null)).resolves.toBeNull();
    await expect(service.tryDescribe(' ')).resolves.toBeNull();
    expect(axiosGet).not.toHaveBeenCalled();
  });

  it('reports 503 when data.gov.ro is down and nothing is cached', async () => {
    const { service } = setup(() => Promise.reject(new Error('ECONNRESET')));
    await expect(service.describe('6920')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('lets company pages load without CAEN names when data.gov.ro is down', async () => {
    const { service } = setup(() => Promise.reject(new Error('ECONNRESET')));
    await expect(service.tryDescribe('6920')).resolves.toBeNull();
  });

  it('waits before retrying a failed download', async () => {
    vi.useFakeTimers();
    let fail = true;
    const { service, axiosGet } = setup((url) =>
      fail
        ? Promise.reject(new Error('ECONNRESET'))
        : Promise.resolve({
            data: isSearch(url) ? CAEN_SEARCH : CAEN_CSV,
          }),
    );
    await service.tryDescribe('6920');
    fail = false;
    await expect(service.tryDescribe('6920')).resolves.toBeNull();
    expect(axiosGet).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(CAEN_RETRY_MS + 1);
    await expect(service.tryDescribe('6920')).resolves.toMatchObject({
      code: '6920',
    });
  });

  it('keeps serving the old copy when a refresh fails', async () => {
    vi.useFakeTimers();
    let fail = false;
    const { service } = setup((url) =>
      fail
        ? Promise.reject(new Error('ECONNRESET'))
        : Promise.resolve({
            data: isSearch(url) ? CAEN_SEARCH : CAEN_CSV,
          }),
    );
    await service.describe('6920');
    fail = true;
    vi.advanceTimersByTime(CAEN_TTL_MS + 1);
    await expect(service.describe('6920')).resolves.toMatchObject({
      code: '6920',
    });
  });

  it('fails when the search has no nomenclator dataset', async () => {
    const { service } = setup(() =>
      Promise.resolve({ data: { result: { results: [] } } }),
    );
    await expect(service.describe('6920')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});

describe('CaenController', () => {
  it('requires a session', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, CaenController)).toEqual([
      JwtAuthGuard,
    ]);
  });

  it('returns the CAEN info or 404', async () => {
    const controller = new CaenController(setup().service);
    await expect(controller.get('6920')).resolves.toMatchObject({
      code: '6920',
    });
    await expect(controller.get('0000')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
