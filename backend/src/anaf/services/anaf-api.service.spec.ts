import type { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import type { Repository } from 'typeorm';
import type { ApiLogsService } from '../../api-logs/api-logs.service.js';
import {
  AnafApiService,
  PERMISSION_DENIAL_MEMORY_MS,
} from './anaf-api.service.js';
import type { AnafConnection } from '../anaf-connection.entity.js';
import type { AnafOAuthService } from './anaf-oauth.service.js';

function setup() {
  const request = vi.fn().mockResolvedValue({ status: 200, data: {} });
  let issued = 0;
  const getAccessToken = vi.fn(() => Promise.resolve(`tok-${issued++}`));
  const row: Partial<AnafConnection> = {
    id: 'c',
    deniedWithFreshTokenAt: null,
  };
  const connections = {
    findOne: vi.fn(() => Promise.resolve({ ...row })),
    update: vi.fn((_id: string, values: Partial<AnafConnection>) => {
      Object.assign(row, values);
      return Promise.resolve({ affected: 1 });
    }),
  };
  const instance = () =>
    new AnafApiService(
      new ConfigService({
        ANAF_API_ENDPOINT: 'https://api.anaf.ro',
        ANAF_ENV: 'test',
      }),
      { axiosRef: { request } } as unknown as HttpService,
      { getAccessToken } as unknown as AnafOAuthService,
      {
        record: vi.fn().mockResolvedValue(undefined),
      } as unknown as ApiLogsService,
      connections as unknown as Repository<AnafConnection>,
    );
  return {
    service: instance(),
    instance,
    request,
    getAccessToken,
    connections,
    row,
  };
}

describe('AnafApiService base URL', () => {
  it('defaults to ANAF_API_ENDPOINT', async () => {
    const { service, request } = setup();
    await service.request({
      accountantId: 1,
      connectionId: 'c',
      service: 'X',
      path: '/p',
    });
    expect(request.mock.calls[0][0].baseURL).toBe('https://api.anaf.ro');
  });

  it('uses the per-request baseUrl when given', async () => {
    const { service, request } = setup();
    await service.request({
      accountantId: 1,
      connectionId: 'c',
      service: 'SPV',
      path: '/listaMesaje',
      baseUrl: 'https://webserviced.anaf.ro/SPVWS2/rest',
    });
    expect(request.mock.calls[0][0].baseURL).toBe(
      'https://webserviced.anaf.ro/SPVWS2/rest',
    );
  });
});

describe('AnafApiService allowStatuses', () => {
  const req = {
    accountantId: 1,
    connectionId: 'c',
    service: 'EFACTURA',
    path: '/p',
  };

  it('returns an allowed 4xx answer instead of throwing', async () => {
    const { service, request } = setup();
    request.mockResolvedValue({ status: 400, data: { message: 'x' } });
    const res = await service.request({ ...req, allowStatuses: [400] });
    expect(res.status).toBe(400);
  });

  it('still throws for a 4xx answer that is not allowed', async () => {
    const { service, request } = setup();
    request.mockResolvedValue({ status: 400, data: {} });
    await expect(service.request(req)).rejects.toThrow('ANAF a răspuns cu 400');
  });

  it('never lets 429 through', async () => {
    const { service, request } = setup();
    request.mockResolvedValue({ status: 429, data: {} });
    await expect(
      service.request({ ...req, allowStatuses: [429] }),
    ).rejects.toThrow('1000 de cereri');
  });
});

describe('AnafApiService token refresh on 401/403', () => {
  const req = {
    accountantId: 1,
    connectionId: 'c',
    service: 'EFACTURA',
    path: '/p',
  };

  it('retries once with a refreshed token after a 401', async () => {
    const { service, request, getAccessToken } = setup();
    request
      .mockResolvedValueOnce({ status: 401, data: {} })
      .mockResolvedValueOnce({ status: 200, data: {} });
    await expect(service.request(req)).resolves.toMatchObject({ status: 200 });
    expect(getAccessToken).toHaveBeenLastCalledWith('c', { force: true });
    expect(request.mock.calls[1][0].headers.Authorization).toBe('Bearer tok-1');
  });

  it('stops rotating tokens for a 403 that a fresh token also gets', async () => {
    const { service, request, getAccessToken } = setup();
    request.mockResolvedValue({ status: 403, data: {} });
    await expect(service.request(req)).rejects.toThrow(/refuzat accesul/);
    expect(getAccessToken).toHaveBeenCalledTimes(2);

    getAccessToken.mockClear();
    await expect(service.request(req)).rejects.toThrow(/refuzat accesul/);
    expect(getAccessToken).toHaveBeenCalledTimes(1);
    expect(getAccessToken).not.toHaveBeenCalledWith('c', { force: true });
  });

  it('shares the 403 memory with other instances through the connection row', async () => {
    const { service, instance, request, getAccessToken, row } = setup();
    request.mockResolvedValue({ status: 403, data: {} });
    await expect(service.request(req)).rejects.toThrow(/refuzat accesul/);
    expect(row.deniedWithFreshTokenAt).toBeInstanceOf(Date);

    getAccessToken.mockClear();
    await expect(instance().request(req)).rejects.toThrow(/refuzat accesul/);
    expect(getAccessToken).not.toHaveBeenCalledWith('c', { force: true });
  });

  it('tries a refresh again once the 403 memory is older than an hour', async () => {
    const { service, request, getAccessToken, row } = setup();
    row.deniedWithFreshTokenAt = new Date(
      Date.now() - PERMISSION_DENIAL_MEMORY_MS - 1000,
    );
    request
      .mockResolvedValueOnce({ status: 403, data: {} })
      .mockResolvedValueOnce({ status: 200, data: {} });
    await expect(service.request(req)).resolves.toMatchObject({ status: 200 });
    expect(getAccessToken).toHaveBeenLastCalledWith('c', { force: true });
  });

  it('does not mark the connection when the first 403 is not retried with a new token', async () => {
    const { service, request, getAccessToken, connections } = setup();
    getAccessToken.mockResolvedValue('same');
    request.mockResolvedValue({ status: 403, data: {} });
    await expect(service.request(req)).rejects.toThrow(/refuzat accesul/);
    expect(connections.update).not.toHaveBeenCalled();
  });
});
