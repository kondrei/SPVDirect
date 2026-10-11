import { screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ME, renderApp } from './render';

afterEach(() => vi.unstubAllGlobals());

const totals = (over: Record<string, number> = {}) => ({
  invoices: 0,
  stornos: 0,
  netRon: 0,
  vatRon: 0,
  grossRon: 0,
  ...over,
});

const STATS = {
  month: totals({
    invoices: 3,
    stornos: 1,
    netRon: 1000,
    vatRon: 210,
    grossRon: 1210,
  }),
  previousMonth: totals({ invoices: 2, grossRon: 1000 }),
  year: totals({
    invoices: 14,
    stornos: 2,
    netRon: 8000,
    vatRon: 1680,
    grossRon: 9680,
  }),
  months: [
    { month: '2026-05', invoices: 1, grossRon: 500 },
    { month: '2026-06', invoices: 2, grossRon: 1000 },
    { month: '2026-07', invoices: 0, grossRon: 0 },
    { month: '2026-08', invoices: 3, grossRon: 2000 },
    { month: '2026-09', invoices: 2, grossRon: 1000 },
    { month: '2026-10', invoices: 3, grossRon: 1210 },
  ],
};

function routes(stats: unknown) {
  return {
    'GET /auth/me': { status: 200, body: ME },
    'GET /accountants/1/companies': { status: 200, body: [] },
    'GET /accountants/1/anaf/connections': { status: 200, body: [] },
    'GET /accountants/1/invoices/stats': stats as {
      status: number;
      body?: unknown;
    },
  };
}

describe('Statistici facturi pe panou', () => {
  it('shows this month, the trend against last month and the year', async () => {
    renderApp(
      '/accountants/1',
      routes({ status: 200, body: STATS }),
    );
    expect(
      await screen.findByText('Facturi emise luna aceasta'),
    ).toBeInTheDocument();
    expect(await screen.findByText('1 stornări')).toBeInTheDocument();
    expect(
      screen.getByText(/\+210,00 față de luna trecută/),
    ).toBeInTheDocument();
    expect(screen.getByText('9.680,00 RON')).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(6);
  });

  it('shows a decrease with a minus sign', async () => {
    renderApp(
      '/accountants/1',
      routes({
        status: 200,
        body: {
          ...STATS,
          previousMonth: totals({ grossRon: 2000 }),
        },
      }),
    );
    expect(
      await screen.findByText(/−790,00 față de luna trecută/),
    ).toBeInTheDocument();
  });

  it('shows the error without breaking the rest of the dashboard', async () => {
    renderApp(
      '/accountants/1',
      routes({ status: 500, body: { message: 'Eroare internă' } }),
    );
    expect(await screen.findByText('Firme gestionate')).toBeInTheDocument();
    expect(await screen.findByText(/Eroare internă/)).toBeInTheDocument();
  });
});
