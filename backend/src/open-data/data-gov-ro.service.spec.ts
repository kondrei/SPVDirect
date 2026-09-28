import type { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { DataGovRoService } from './data-gov-ro.service.js';

function setup(get: (url: string, opts: unknown) => Promise<unknown>) {
  const axiosGet = vi.fn(get);
  const service = new DataGovRoService(
    new ConfigService({
      DATA_GOV_RO_API_URL: 'https://data.gov.ro/api/3/action/',
    }),
    { axiosRef: { get: axiosGet } } as unknown as HttpService,
  );
  return { service, axiosGet };
}

describe('DataGovRoService.searchPackages', () => {
  it('searches one organization, newest first', async () => {
    const { service, axiosGet } = setup(() =>
      Promise.resolve({
        data: { success: true, result: { results: [{ name: 'x' }] } },
      }),
    );
    await expect(
      service.searchPackages('nomenclatoare', 'onrc'),
    ).resolves.toEqual([{ name: 'x' }]);
    const url = new URL(axiosGet.mock.calls[0][0]);
    expect(url.origin + url.pathname).toBe(
      'https://data.gov.ro/api/3/action/package_search',
    );
    expect(Object.fromEntries(url.searchParams)).toEqual({
      q: 'nomenclatoare',
      fq: 'organization:onrc',
      sort: 'metadata_created desc',
      rows: '20',
    });
  });

  it('throws when CKAN reports a failure', async () => {
    const { service } = setup(() =>
      Promise.resolve({ data: { success: false } }),
    );
    await expect(service.searchPackages('q', 'mfp')).rejects.toThrow(
      'package_search failed',
    );
  });
});
