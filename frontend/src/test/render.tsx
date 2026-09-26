import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { vi } from 'vitest';
import { routes } from '../router';

type Handler = (init: RequestInit | undefined) => {
  status: number;
  body?: unknown;
};

export function renderApp(
  path: string,
  api: Record<string, Handler | { status: number; body?: unknown }>,
) {
  const calls: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string, init?: RequestInit) => {
      const key = `${init?.method ?? 'GET'} ${input.replace(/^\/api/, '')}`;
      calls.push(key);
      const h = api[key];
      const res =
        typeof h === 'function'
          ? h(init)
          : (h ?? { status: 404, body: { message: 'Not Found' } });
      return new Response(
        res.status === 204 ? null : JSON.stringify(res.body ?? {}),
        { status: res.status, headers: { 'content-type': 'application/json' } },
      );
    }),
  );
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  const utils = render(
    <QueryClientProvider client={qc}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { ...utils, router, calls };
}

export const ME = {
  id: 'a1',
  email: 'andrei@cabinet.ro',
  name: 'Andrei K',
  createdAt: '2026-09-01T00:00:00Z',
};
