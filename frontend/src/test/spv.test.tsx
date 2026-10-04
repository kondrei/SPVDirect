import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ME, renderApp } from './render';

afterEach(() => vi.unstubAllGlobals());

const future = (days: number) =>
  new Date(Date.now() + days * 86_400_000).toISOString();

const CONN = {
  id: 'c1',
  accountantId: 1,
  label: 'Popescu — token USB',
  certSerial: '4C000012A9F3',
  roles: ['HELLO'],
  source: 'self',
  accessExpiresAt: future(80),
  refreshExpiresAt: future(200),
  lastRefreshedAt: null,
  status: 'active',
  createdAt: future(-1),
  updatedAt: future(-1),
};

const ARCHIVE = {
  items: [
    {
      id: 5,
      anafMessageId: '100000000',
      cif: '8000000000',
      type: 'RECIPISA',
      details: 'Recipisa D300',
      requestId: null,
      createdAt: '2017-12-20T10:00:00.000Z',
      createdAtRaw: '20.12.2017 12:00:00',
      companyId: 7,
      stored: true,
      sizeBytes: 4,
      downloadedAt: '2026-10-04T10:00:00.000Z',
    },
    {
      id: 6,
      anafMessageId: '100000001',
      cif: '8000000000',
      type: 'NOTIFICARE',
      details: 'Notificare',
      requestId: '999111',
      createdAt: null,
      createdAtRaw: null,
      companyId: null,
      stored: false,
      sizeBytes: null,
      downloadedAt: null,
    },
  ],
  total: 2,
  page: 1,
  pageSize: 25,
};

const base = {
  'GET /auth/me': { status: 200, body: ME },
  'GET /accountants/1/companies': { status: 200, body: [] },
  'GET /accountants/1/anaf/connections': { status: 200, body: [CONN] },
  'GET /accountants/1/spv/archive?page=1&pageSize=25': {
    status: 200,
    body: ARCHIVE,
  },
};

describe('Mesaje SPV', () => {
  it('shows the stored messages and whether each document is saved', async () => {
    renderApp('/accountants/1/spv', base);
    expect(await screen.findByText('Recipisa D300')).toBeInTheDocument();
    expect(screen.getByText('Notificare')).toBeInTheDocument();
    expect(screen.getByText('Salvat')).toBeInTheDocument();
    expect(screen.getByText('Nesalvat')).toBeInTheDocument();
    expect(screen.getByText(/Pagina 1 din 1 · 2 mesaje/)).toBeInTheDocument();
  });

  it('filters the archive by CIF', async () => {
    const { calls } = renderApp('/accountants/1/spv', {
      ...base,
      'GET /accountants/1/spv/archive?page=1&pageSize=25&cif=8000000000': {
        status: 200,
        body: { ...ARCHIVE, items: [ARCHIVE.items[0]], total: 1 },
      },
    });
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('CIF/CNP'), '800 000 0000');
    await user.click(screen.getByRole('button', { name: 'Filtrează' }));
    await waitFor(() =>
      expect(calls).toContain(
        'GET /accountants/1/spv/archive?page=1&pageSize=25&cif=8000000000',
      ),
    );
    await waitFor(() =>
      expect(screen.queryByText('Notificare')).not.toBeInTheDocument(),
    );
  });

  it('syncs from ANAF and reports what was saved', async () => {
    let sent: unknown;
    const { calls } = renderApp('/accountants/1/spv', {
      ...base,
      'POST /accountants/1/anaf/connections/c1/spv/sync': (init) => {
        sent = JSON.parse(String(init?.body));
        return {
          status: 200,
          body: { fetched: 3, added: 2, downloaded: 2, failed: 0, pending: 0 },
        };
      },
    });
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole('button', { name: 'Sincronizează din ANAF' }),
    );
    expect(
      await screen.findByText(/3 mesaje la ANAF, 2 noi/),
    ).toBeInTheDocument();
    expect(sent).toEqual({ zile: 60 });
    await waitFor(() =>
      expect(
        calls.filter((c) => c.includes('/spv/archive')).length,
      ).toBeGreaterThan(1),
    );
  });

  it('rejects more than 60 days without calling the API', async () => {
    const { calls } = renderApp('/accountants/1/spv', base);
    const user = userEvent.setup();
    const days = await screen.findByLabelText('Ultimele zile');
    await user.clear(days);
    await user.type(days, '61');
    await user.click(
      screen.getByRole('button', { name: 'Sincronizează din ANAF' }),
    );
    expect(await screen.findByText(/între 1 și 60/)).toBeInTheDocument();
    expect(calls.some((c) => c.startsWith('POST'))).toBe(false);
  });

  it('shows the backend error when ANAF refuses the sync', async () => {
    renderApp('/accountants/1/spv', {
      ...base,
      'POST /accountants/1/anaf/connections/c1/spv/sync': {
        status: 400,
        body: { message: 'ANAF: Fără drept de acces' },
      },
    });
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole('button', { name: 'Sincronizează din ANAF' }),
    );
    expect(
      await screen.findByText('ANAF: Fără drept de acces'),
    ).toBeInTheDocument();
  });

  it('submits a document request and shows the request number', async () => {
    let sent: unknown;
    renderApp('/accountants/1/spv', {
      ...base,
      'POST /accountants/1/anaf/connections/c1/spv/requests': (init) => {
        sent = JSON.parse(String(init?.body));
        return { status: 201, body: { requestId: '260149' } };
      },
    });
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('Tip cerere'), 'D300');
    await user.type(screen.getByLabelText('CUI/CNP'), 'RO 8000000000');
    await user.type(screen.getByLabelText('An (opțional)'), '2018');
    await user.type(screen.getByLabelText('Luna (opțional)'), '1');
    await user.click(screen.getByRole('button', { name: 'Trimite cererea' }));

    expect(await screen.findByText('260149')).toBeInTheDocument();
    expect(sent).toEqual({ tip: 'D300', cui: '8000000000', an: 2018, luna: 1 });
  });

  it('validates the request before sending', async () => {
    const { calls } = renderApp('/accountants/1/spv', base);
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('Tip cerere'), 'D300');
    await user.type(screen.getByLabelText('CUI/CNP'), 'abc');
    await user.click(screen.getByRole('button', { name: 'Trimite cererea' }));
    expect(await screen.findByText(/CUI\/CNP invalid/)).toBeInTheDocument();
    await waitFor(() =>
      expect(calls.some((c) => c.startsWith('POST'))).toBe(false),
    );
  });

  it('asks for a certificate when none is active', async () => {
    renderApp('/accountants/1/spv', {
      ...base,
      'GET /accountants/1/anaf/connections': { status: 200, body: [] },
    });
    expect(
      await screen.findByText('Niciun certificat activ.'),
    ).toBeInTheDocument();
    expect(await screen.findByText('Recipisa D300')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Sincronizează din ANAF' }),
    ).not.toBeInTheDocument();
  });
});
