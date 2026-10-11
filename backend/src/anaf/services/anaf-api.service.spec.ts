import type { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import type { Repository } from 'typeorm';
import type { ApiLogsService } from '../../api-logs/api-logs.service.js';
import { AnafApiService } from './anaf-api.service.js';
import type { AnafConnection } from '../anaf-connection.entity.js';
import type { AnafOAuthService } from './anaf-oauth.service.js';

function setup() {
  const request = vi.fn().mockResolvedValue({ status: 200, data: {} });
  const service = new AnafApiService(
    new ConfigService({
      ANAF_API_ENDPOINT: 'https://api.anaf.ro',
      ANAF_ENV: 'test',
    }),
    { axiosRef: { request } } as unknown as HttpService,
    {
      getAccessToken: vi.fn().mockResolvedValue('tok'),
    } as unknown as AnafOAuthService,
    {
      record: vi.fn().mockResolvedValue(undefined),
    } as unknown as ApiLogsService,
    {
      existsBy: vi.fn().mockResolvedValue(true),
    } as unknown as Repository<AnafConnection>,
  );
  return { service, request };
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
