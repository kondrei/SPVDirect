import { BadGatewayException } from '@nestjs/common';
import type { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { REMOVE_CHUNK } from '../../common/storage/supabase-storage.js';
import { InvoiceFileStore } from './invoice-file-store.service.js';

function setup(env: Record<string, string> = {}) {
  const request = vi.fn().mockResolvedValue({ status: 200 });
  const store = new InvoiceFileStore(
    new ConfigService({
      SUPABASE_URL: 'https://abc.supabase.co',
      SUPABASE_SERVICE_KEY: 'service-key',
      SUPABASE_INVOICE_BUCKET: 'invoices',
      ...env,
    }),
    { axiosRef: { request } } as unknown as HttpService,
  );
  return { store, request };
}

describe('InvoiceFileStore', () => {
  it('is configured only with a Supabase URL and service key', () => {
    expect(setup().store.configured).toBe(true);
    expect(setup({ SUPABASE_URL: '' }).store.configured).toBe(false);
    expect(setup({ SUPABASE_SERVICE_KEY: '' }).store.configured).toBe(false);
  });

  it('builds a path per accountant, company, series and number', () => {
    expect(setup().store.pathFor(1, 7, 'FCT', 12)).toBe('1/7/FCT-000012.pdf');
  });

  it('uploads PDFs to the invoices bucket', async () => {
    const { store, request } = setup();
    await store.put('1/7/FCT-000012.pdf', Buffer.from('x'));
    const upload = request.mock.calls.at(-1)?.[0];
    expect(upload).toMatchObject({
      method: 'POST',
      url: 'https://abc.supabase.co/storage/v1/object/invoices/1/7/FCT-000012.pdf',
      headers: expect.objectContaining({ 'Content-Type': 'application/pdf' }),
    });
  });

  it('deletes stored PDFs in chunks of REMOVE_CHUNK', async () => {
    const { store, request } = setup();
    const paths = Array.from(
      { length: REMOVE_CHUNK + 1 },
      (_, i) => `1/7/FCT-${i}.pdf`,
    );
    await store.remove(paths);
    const deletes = request.mock.calls
      .map((c) => c[0] as { method: string; url: string; data: unknown })
      .filter((c) => c.method === 'DELETE');
    expect(deletes).toHaveLength(2);
    expect(deletes[0]).toMatchObject({
      url: 'https://abc.supabase.co/storage/v1/object/invoices',
      data: { prefixes: paths.slice(0, REMOVE_CHUNK) },
    });
    expect(deletes[1].data).toEqual({ prefixes: paths.slice(REMOVE_CHUNK) });
  });

  it('treats a 404 on delete as already gone and fails on other errors', async () => {
    const { store, request } = setup();
    request.mockResolvedValueOnce({ status: 404 });
    await expect(store.remove(['1/7/a.pdf'])).resolves.toBeUndefined();
    request.mockResolvedValueOnce({ status: 500 });
    await expect(store.remove(['1/7/a.pdf'])).rejects.toBeInstanceOf(
      BadGatewayException,
    );
  });
});
