import type { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { AnafEnvironment } from '../../anaf/dto/anaf.enums.js';
import { EfacturaFileKind } from '../dto/efactura.enums.js';
import { EfacturaFileStore } from './efactura-file-store.service.js';

const URL = 'https://abc.supabase.co';

function setup(env: Record<string, string> = {}) {
  const request = vi.fn().mockResolvedValue({ status: 200 });
  const store = new EfacturaFileStore(
    new ConfigService({
      EFACTURA_STORAGE: 'supabase',
      SUPABASE_URL: URL,
      SUPABASE_SERVICE_KEY: 'service-key',
      SUPABASE_EFACTURA_BUCKET: 'efactura',
      ...env,
    }),
    { axiosRef: { request } } as unknown as HttpService,
  );
  return { store, request };
}

describe('EfacturaFileStore', () => {
  it('is enabled only for EFACTURA_STORAGE=supabase', () => {
    expect(setup().store.enabled).toBe(true);
    expect(setup({ EFACTURA_STORAGE: 'database' }).store.enabled).toBe(false);
  });

  it('is configured when the Supabase URL and key are set', () => {
    expect(setup().store.configured).toBe(true);
    expect(setup({ SUPABASE_URL: '' }).store.configured).toBe(false);
  });

  it('keeps each file under the accountant, the company and the environment', () => {
    expect(
      setup().store.pathFor(
        {
          accountantId: 1,
          companyId: 7,
          environment: AnafEnvironment.Prod,
          anafMessageId: '3001',
        },
        EfacturaFileKind.Pdf,
      ),
    ).toBe('1/7/prod/3001.pdf');
  });

  it('uploads to its own bucket', async () => {
    const { store, request } = setup();
    await store.put('1/7/prod/3001.zip', Buffer.from('PK'), 'application/zip');
    expect(request).toHaveBeenLastCalledWith(
      expect.objectContaining({
        method: 'POST',
        url: `${URL}/storage/v1/object/efactura/1/7/prod/3001.zip`,
      }),
    );
  });
});
