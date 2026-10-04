import { BadGatewayException } from '@nestjs/common';
import type { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { AxiosError } from 'axios';
import { SpvFileStore } from './spv-file-store.service.js';

const URL = 'https://abc.supabase.co';

function setup(env: Record<string, string> = {}) {
  const request = vi.fn();
  const store = new SpvFileStore(
    new ConfigService({
      SPV_STORAGE: 'supabase',
      SUPABASE_URL: `${URL}/`,
      SUPABASE_SERVICE_KEY: 'service-key',
      SUPABASE_SPV_BUCKET: 'spv-messages',
      ...env,
    }),
    { axiosRef: { request } } as unknown as HttpService,
  );
  return { store, request };
}

describe('SpvFileStore', () => {
  it('is enabled only for SPV_STORAGE=supabase', () => {
    expect(setup().store.enabled).toBe(true);
    expect(setup({ SPV_STORAGE: 'database' }).store.enabled).toBe(false);
  });

  it('builds a per-accountant path', () => {
    expect(setup().store.pathFor(3, '100')).toBe('3/100.pdf');
  });

  it('creates the private bucket once, then uploads with upsert', async () => {
    const { store, request } = setup();
    request
      .mockResolvedValueOnce({ status: 404 })
      .mockResolvedValueOnce({ status: 200 })
      .mockResolvedValue({ status: 200 });

    await store.put('3/100.pdf', Buffer.from('x'), 'application/pdf');
    await store.put('3/101.pdf', Buffer.from('y'), 'application/pdf');

    const calls = request.mock.calls.map((c) => c[0]);
    expect(calls[0]).toMatchObject({
      method: 'GET',
      url: `${URL}/storage/v1/bucket/spv-messages`,
    });
    expect(calls[1]).toMatchObject({
      method: 'POST',
      url: `${URL}/storage/v1/bucket`,
      data: { id: 'spv-messages', name: 'spv-messages', public: false },
    });
    expect(calls[2]).toMatchObject({
      method: 'POST',
      url: `${URL}/storage/v1/object/spv-messages/3/100.pdf`,
      headers: expect.objectContaining({
        Authorization: 'Bearer service-key',
        apikey: 'service-key',
        'Content-Type': 'application/pdf',
        'x-upsert': 'true',
      }),
    });
    expect(calls).toHaveLength(4);
  });

  it('skips bucket creation when the bucket exists', async () => {
    const { store, request } = setup();
    request.mockResolvedValue({ status: 200 });
    await store.put('3/100.pdf', Buffer.from('x'), 'application/pdf');
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('treats an already existing bucket as fine', async () => {
    const { store, request } = setup();
    request
      .mockResolvedValueOnce({ status: 404 })
      .mockResolvedValueOnce({ status: 409 })
      .mockResolvedValueOnce({ status: 200 });
    await expect(
      store.put('3/100.pdf', Buffer.from('x'), 'application/pdf'),
    ).resolves.toBeUndefined();
  });

  it('downloads the object bytes', async () => {
    const { store, request } = setup();
    request.mockResolvedValue({ status: 200, data: Buffer.from('pdf') });
    const bytes = await store.get('3/100.pdf');
    expect(bytes.toString()).toBe('pdf');
    expect(request.mock.calls[0][0]).toMatchObject({
      method: 'GET',
      url: `${URL}/storage/v1/object/spv-messages/3/100.pdf`,
      responseType: 'arraybuffer',
    });
  });

  it('maps an HTTP error to 502 without leaking the key', async () => {
    const { store, request } = setup();
    request.mockResolvedValue({ status: 500 });
    const err = await store.get('3/100.pdf').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(BadGatewayException);
    expect(JSON.stringify((err as Error).message)).not.toContain('service-key');
  });

  it('maps a network failure to 502', async () => {
    const { store, request } = setup();
    request.mockRejectedValue(new AxiosError('timeout', 'ECONNABORTED'));
    await expect(store.get('3/100.pdf')).rejects.toBeInstanceOf(
      BadGatewayException,
    );
  });

  it('retries bucket creation after a failure', async () => {
    const { store, request } = setup();
    request
      .mockResolvedValueOnce({ status: 404 })
      .mockResolvedValueOnce({ status: 500 });
    await expect(
      store.put('3/100.pdf', Buffer.from('x'), 'application/pdf'),
    ).rejects.toBeInstanceOf(BadGatewayException);
    request.mockResolvedValue({ status: 200 });
    await expect(
      store.put('3/100.pdf', Buffer.from('x'), 'application/pdf'),
    ).resolves.toBeUndefined();
  });
});
