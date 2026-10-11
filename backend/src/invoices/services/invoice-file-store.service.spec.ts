import type { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
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
});
