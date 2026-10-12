import { screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ME, renderApp } from './render';

afterEach(() => vi.unstubAllGlobals());

const STATS = {
  accountants: 42,
  companies: 1250,
  invoices: 18400,
  efacturaUploads: 17950,
  spvMessages: 30210,
  anafConnections: 61,
  updatedAt: '2026-10-12T08:30:00Z',
};

describe('landing page', () => {
  it('shows the features and the public counters to signed-out visitors', async () => {
    const { calls } = renderApp('/', {
      'GET /auth/me': { status: 401 },
      'GET /public/stats': { status: 200, body: STATS },
    });
    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'Serviciile ANAF ale tuturor clienților, într-un singur loc.',
      }),
    ).toBeInTheDocument();
    const counters = screen.getByRole('region', { name: 'SPVDirect în cifre' });
    expect(await within(counters).findByText('1.250')).toBeInTheDocument();
    expect(within(counters).getByText('18.400')).toBeInTheDocument();
    expect(within(counters).getByText('Contabili activi')).toBeInTheDocument();
    expect(within(counters).getByText(/Actualizat la/)).toBeInTheDocument();
    const features = screen.getByRole('region', { name: 'Funcționalități' });
    expect(within(features).getByRole('heading', { name: 'RO e-Factura' })).toBeInTheDocument();
    expect(within(features).getByText('În curând')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Autentificare' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Cont nou' })).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByRole('figure', { name: /Captură din aplicația SPVDirect/ })).toBeInTheDocument();
    expect(calls).toContain('GET /public/stats');
  });

  it('keeps the page usable when the counters cannot be loaded', async () => {
    renderApp('/', {
      'GET /auth/me': { status: 401 },
      'GET /public/stats': { status: 429, body: { message: 'ThrottlerException: Too Many Requests' } },
    });
    expect(
      await screen.findByText('Cifrele nu sunt disponibile momentan. Reveniți în câteva minute.'),
    ).toBeInTheDocument();
    const counters = screen.getByRole('region', { name: 'SPVDirect în cifre' });
    expect(within(counters).getAllByText('—')).toHaveLength(6);
    expect(screen.getByRole('heading', { name: 'Funcționalități' })).toBeInTheDocument();
  });

  it('shows a signed-in accountant the way back to the app', async () => {
    const { router } = renderApp('/', {
      'GET /auth/me': { status: 200, body: ME },
      'GET /public/stats': { status: 200, body: STATS },
    });
    const links = await screen.findAllByRole('link', { name: 'Deschide aplicația' });
    expect(links).toHaveLength(3);
    for (const link of links) expect(link).toHaveAttribute('href', '/accountants/1');
    expect(screen.queryByRole('button', { name: /Creează cont/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
  });
});
