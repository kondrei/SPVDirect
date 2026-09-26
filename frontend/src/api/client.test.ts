import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError, errorMessage } from './client';

afterEach(() => vi.unstubAllGlobals());

function stubFetch(
  status: number,
  body: unknown,
  contentType = 'application/json',
) {
  const fn = vi.fn(
    async () =>
      new Response(
        status === 204
          ? null
          : typeof body === 'string'
            ? body
            : JSON.stringify(body),
        { status, headers: { 'content-type': contentType } },
      ),
  );
  vi.stubGlobal('fetch', fn);
  return fn;
}

describe('errorMessage', () => {
  it('keeps the backend Romanian message', () => {
    expect(
      errorMessage(409, {
        statusCode: 409,
        message: 'Firma cu acest CUI există deja',
      }),
    ).toBe('Firma cu acest CUI există deja');
  });
  it('joins class-validator messages', () => {
    expect(
      errorMessage(400, { message: ['CUI invalid', 'name must be a string'] }),
    ).toBe('CUI invalid; name must be a string');
  });
  it('replaces bare English status text with Romanian', () => {
    expect(errorMessage(401, { message: 'Unauthorized' })).toMatch(
      /Sesiunea a expirat/,
    );
    expect(errorMessage(429, 'ThrottlerException')).toMatch(/Prea multe/);
    expect(errorMessage(502, '')).toMatch(/Serverul nu răspunde/);
  });
});

describe('api', () => {
  it('sends cookies and JSON to /api', async () => {
    const fetch = stubFetch(200, { id: '1' });
    await api('/companies', { method: 'POST', json: { cui: '12' } });
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/companies');
    expect(init.credentials).toBe('include');
    expect(init.body).toBe('{"cui":"12"}');
    expect((init.headers as Record<string, string>)['Content-Type']).toBe(
      'application/json',
    );
  });
  it('returns undefined for 204', async () => {
    stubFetch(204, null);
    await expect(
      api('/auth/logout', { method: 'POST' }),
    ).resolves.toBeUndefined();
  });
  it('throws ApiError with status and message', async () => {
    stubFetch(404, { statusCode: 404, message: 'Firma nu a fost găsită' });
    await expect(api('/companies/x')).rejects.toMatchObject({
      name: 'ApiError',
      status: 404,
      message: 'Firma nu a fost găsită',
    });
  });
  it('maps network failures to status 0', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      }),
    );
    const err = await api('/auth/me').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(0);
  });
});
