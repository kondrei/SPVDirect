import { fireEvent, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ActivityAction } from '../api/enums';
import { ACTIVITY_PAGE_SIZE } from '../common/constants';
import { ME, renderApp } from './render';

afterEach(() => vi.unstubAllGlobals());

const SIZE = ACTIVITY_PAGE_SIZE;

const COMPANY = {
  id: 7,
  cui: '12345678',
  name: 'ALFA SRL',
  anafConnectionId: 4,
};

const ITEMS = [
  {
    id: 2,
    action: ActivityAction.InvoiceIssued,
    companyId: 7,
    description: 'Factura FCT 000012 a fost emisă către BETA SRL: 1.210,00 RON',
    details: { invoiceId: 9 },
    accountantName: 'Andrei K',
    createdAt: '2026-10-21T08:15:00Z',
  },
  {
    id: 1,
    action: ActivityAction.CompanyDeleted,
    companyId: 3,
    description: 'Firma GAMA SRL (CUI 999) a fost ștearsă',
    details: { companyName: 'GAMA SRL', cui: '999' },
    accountantName: 'Andrei K',
    createdAt: '2026-10-20T15:00:00Z',
  },
];

const OLDER = [
  {
    id: 0,
    action: ActivityAction.LoggedIn,
    companyId: null,
    description: 'Autentificare în cont',
    details: {},
    accountantName: 'Andrei K',
    createdAt: '2026-10-19T09:00:00Z',
  },
];

function routes(page: (key: string) => { status: number; body?: unknown }) {
  return {
    'GET /auth/me': { status: 200, body: ME },
    'GET /accountants/1/companies': { status: 200, body: [COMPANY] },
    'GET /accountants/1/anaf/connections': { status: 200, body: [] },
    'GET /accountants/1/invoices/stats': { status: 500, body: {} },
    [`GET /accountants/1/activity?page=1&pageSize=${SIZE}`]: page('page1'),
    [`GET /accountants/1/activity?page=1&pageSize=${SIZE}&companyId=7`]:
      page('company'),
    [`GET /accountants/1/activity?page=2&pageSize=${SIZE}`]: page('page2'),
  };
}

describe('Activitate pe panou', () => {
  it('lists the operations with date, label, company and details', async () => {
    renderApp(
      '/accountants/1',
      routes(() => ({
        status: 200,
        body: { items: ITEMS, total: 2, page: 1, pageSize: SIZE },
      })),
    );
    const table = await screen.findByRole('table', { name: 'Activitate' });
    const rows = within(table).getAllByRole('row');
    expect(rows).toHaveLength(3);
    expect(within(rows[1]).getByText('Factură emisă')).toBeInTheDocument();
    expect(
      within(rows[1]).getByRole('link', { name: 'ALFA SRL' }),
    ).toHaveAttribute('href', '/accountants/1/companies/7');
    expect(
      within(rows[1]).getByText(/Factura FCT 000012 a fost emisă/),
    ).toBeInTheDocument();
    expect(within(table).queryByText('Andrei K')).not.toBeInTheDocument();
    expect(within(table).queryByText('Utilizator')).not.toBeInTheDocument();
    expect(within(rows[2]).getByText('Firmă ștearsă')).toBeInTheDocument();
    expect(within(rows[2]).getByText('GAMA SRL')).toBeInTheDocument();
    expect(screen.getByText(/Pagina 1 din 1 · 2 operațiuni/)).toBeInTheDocument();
  });

  it('shows the entries of scheduled jobs with their own labels', async () => {
    renderApp(
      '/accountants/1',
      routes(() => ({
        status: 200,
        body: {
          items: [
            {
              id: 4,
              action: ActivityAction.EfacturaArchiveSyncFailed,
              companyId: 7,
              description:
                'Importul automat în arhiva e-Factura a firmei ALFA SRL (CUI 12345678) a eșuat: ANAF nu răspunde',
              details: { job: 'efactura_archive_sync' },
              accountantName: 'Sistem (automat)',
              createdAt: '2026-10-21T04:00:00Z',
            },
            {
              id: 3,
              action: ActivityAction.CompaniesPurged,
              companyId: null,
              description:
                '1 firmă ștearsă acum peste 30 de zile a fost eliminată definitiv, cu facturile, fișierele e-Factura și mesajele SPV',
              details: { job: 'purge', companies: 1 },
              accountantName: 'Sistem (automat)',
              createdAt: '2026-10-01T00:00:00Z',
            },
          ],
          total: 2,
          page: 1,
          pageSize: SIZE,
        },
      })),
    );
    const table = await screen.findByRole('table', { name: 'Activitate' });
    const rows = within(table).getAllByRole('row');
    expect(within(rows[1]).getByText('Import automat eșuat')).toBeInTheDocument();
    expect(
      within(rows[2]).getByText('Date eliminate definitiv'),
    ).toBeInTheDocument();
    expect(within(rows[2]).getByText('—')).toBeInTheDocument();
  });

  it('filters by company and pages through older operations', async () => {
    const pages = Math.ceil(45 / SIZE);
    const { calls } = renderApp(
      '/accountants/1',
      routes((key) => ({
        status: 200,
        body:
          key === 'page2'
            ? { items: OLDER, total: 45, page: 2, pageSize: SIZE }
            : { items: ITEMS, total: 45, page: 1, pageSize: SIZE },
      })),
    );
    await screen.findByText(`Pagina 1 din ${pages} · 45 de operațiuni`);
    fireEvent.click(screen.getByRole('button', { name: 'Mai vechi' }));
    await vi.waitFor(() =>
      expect(calls).toContain(
        `GET /accountants/1/activity?page=2&pageSize=${SIZE}`,
      ),
    );
    await screen.findByText(`Pagina 2 din ${pages} · 45 de operațiuni`);
    await screen.findByText('Autentificare în cont');
    const rows = within(
      screen.getByRole('table', { name: 'Activitate' }),
    ).getAllByRole('row');
    expect(rows).toHaveLength(OLDER.length + 1);
    expect(within(rows[1]).getByText('Autentificare în cont')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Firma'), {
      target: { value: '7' },
    });
    await vi.waitFor(() =>
      expect(calls).toContain(
        `GET /accountants/1/activity?page=1&pageSize=${SIZE}&companyId=7`,
      ),
    );
  });

  it('says what will appear when nothing was logged yet', async () => {
    renderApp(
      '/accountants/1',
      routes(() => ({
        status: 200,
        body: { items: [], total: 0, page: 1, pageSize: SIZE },
      })),
    );
    expect(
      await screen.findByText('Nicio operațiune înregistrată.'),
    ).toBeInTheDocument();
  });
});
