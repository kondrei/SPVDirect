import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router';
import { ApiError } from './api/client';
import { keys } from './api/hooks';
import { router } from './router';
import './styles/tokens.css';
import './styles/components.css';
import './styles/app.css';

// A 401 anywhere means the session cookie expired: drop the user, and AppLayout
// sends them to /login?next=… (the /auth/me query itself maps 401 to null).
const onError = (err: Error) => {
  if (err instanceof ApiError && err.status === 401) queryClient.setQueryData(keys.me, null);
};

const queryClient: QueryClient = new QueryClient({
  queryCache: new QueryCache({ onError }),
  mutationCache: new MutationCache({ onError }),
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      // Don't retry what won't change: auth, missing rows, validation, rate limits.
      retry: (count, err) => !(err instanceof ApiError && err.status >= 400 && err.status < 500) && count < 2,
      refetchOnWindowFocus: true,
    },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
