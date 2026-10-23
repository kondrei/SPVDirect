import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createRoot } from 'react-dom/client';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { routes } from '../router';
import { SCREENSHOT_API } from './fixtures';
import '../styles/tokens.css';
import '../styles/components.css';
import '../styles/app.css';

const params = new URLSearchParams(location.search);
const theme = params.get('theme') === 'dark' ? 'dark' : 'light';
try {
  localStorage.setItem('spv-theme', theme);
} catch {}

globalThis.fetch = async (input, init) => {
  const url = new URL(typeof input === 'string' ? input : input.toString(), location.origin);
  const path = url.pathname.replace(/^\/api/, '');
  const method = init?.method ?? 'GET';
  const body = method === 'GET' ? SCREENSHOT_API[path] : undefined;
  if (body === undefined) console.warn(`screenshot: no sample data for ${method} ${path}`);
  return new Response(JSON.stringify(body ?? { message: 'Not Found' }), {
    status: body === undefined ? 404 : 200,
    headers: { 'content-type': 'application/json' },
  });
};

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, staleTime: Infinity } },
});
const router = createMemoryRouter(routes, {
  initialEntries: [params.get('path') ?? '/accountants/1'],
});

createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={queryClient}>
    <RouterProvider router={router} />
  </QueryClientProvider>,
);

const frame = () => new Promise((resolve) => requestAnimationFrame(resolve));

async function markReady() {
  await document.fonts.ready;
  let idle = 0;
  while (idle < 3) {
    await frame();
    idle = queryClient.isFetching() === 0 ? idle + 1 : 0;
  }
  document.body.dataset.ready = 'true';
}

void markReady();
