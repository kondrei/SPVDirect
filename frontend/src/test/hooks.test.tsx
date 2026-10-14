import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useLogin } from '../api/hooks/auth';
import { keys } from '../api/hooks/queryKeys';
import { useInvoiceActions } from '../components/invoices/useInvoiceActions';
import { ME } from './render';

afterEach(() => vi.unstubAllGlobals());

function setup(api: Record<string, { status: number; body?: unknown }>) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string, init?: RequestInit) => {
      const res = api[`${init?.method ?? 'GET'} ${input.replace(/^\/api/, '')}`] ?? {
        status: 404,
        body: { message: 'Not Found' },
      };
      return new Response(JSON.stringify(res.body ?? {}), {
        status: res.status,
        headers: { 'content-type': 'application/json' },
      });
    }),
  );
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  qc.setQueryData(keys.me, ME);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return { qc, wrapper };
}

describe('useLogin', () => {
  it('drops the data cached for the previous accountant', async () => {
    const { qc, wrapper } = setup({
      'POST /auth/login': { status: 200, body: { ...ME, id: 2 } },
    });
    qc.setQueryData(keys.companies, [{ id: 1, name: 'FIRMA LUI A' }]);
    const { result } = renderHook(() => useLogin(), { wrapper });
    await act(() =>
      result.current.mutateAsync({ email: 'b@x.ro', password: 'secret123' }),
    );
    expect(qc.getQueryData(keys.companies)).toBeUndefined();
    expect(qc.getQueryData(keys.me)).toMatchObject({ id: 2 });
  });
});

describe('useInvoiceActions', () => {
  it('keeps the result of each invoice when another one is validated', async () => {
    const { wrapper } = setup({
      'POST /accountants/1/efactura/invoices/3/validate': {
        status: 200,
        body: { valid: false, messages: ['BR-01'], traceId: null },
      },
      'POST /accountants/1/efactura/invoices/4/validate': {
        status: 200,
        body: { valid: true, messages: [], traceId: null },
      },
    });
    const { result } = renderHook(() => useInvoiceActions(), { wrapper });
    act(() => {
      result.current.validate(3);
      result.current.validate(4);
    });
    await waitFor(() =>
      expect(result.current.statesFor(4).check?.status).toBe('success'),
    );
    await waitFor(() =>
      expect(result.current.statesFor(3).check).toMatchObject({
        status: 'success',
        data: { valid: false, messages: ['BR-01'] },
      }),
    );
  });

  it('remembers a failure per invoice', async () => {
    const { wrapper } = setup({
      'POST /accountants/1/efactura/invoices/3/upload': {
        status: 409,
        body: { message: 'Factura este deja în curs de trimitere' },
      },
    });
    const { result } = renderHook(() => useInvoiceActions(), { wrapper });
    act(() => result.current.sendToAnaf(3));
    expect(result.current.isPending(3, 'anaf')).toBe(true);
    await waitFor(() =>
      expect(result.current.statesFor(3).anaf?.status).toBe('error'),
    );
    expect(result.current.statesFor(4)).toEqual({});
  });
});
