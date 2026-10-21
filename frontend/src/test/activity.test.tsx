import { fireEvent, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ActivityAction } from '../api/enums';
import { ME, renderApp } from './render';

afterEach(() => vi.unstubAllGlobals());

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

function routes(page: (url: string) => { status: number; body?: unknown }) {
  return {
    'GET /auth/me': { status: 200, body: ME },
    'GET /accountants/1/companies': { status: 200, body: [COMPANY] },
    'GET /accountants/1/anaf/connections': { status: 200, body: [] },
    'GET /accountants/1/invoices/stats': { status: 500, body: {} },
    'GET /accountants/1/activity?page=1&pageSize=20': page(
      '/activity?page=1&pageSize=20',
    ),
    'GET /accountants/1/activity?page=1&pageSize=20&companyId=7': page(
      'company',
    ),
    'GET /accountants/1/activity?page=2&pageSize=20': page('page2'),
  };
}

describe('Activitate pe panou', () => {
  it('lists the operations with date, label, company, details and accountant', async () => {
    renderApp(
      '/accountants/1',
      routes(() => ({
        status: 200,
        body: { items: ITEMS, total: 2, page: 1, pageSize: 20 },
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
    expect(within(rows[1]).getByText('Andrei K')).toBeInTheDocument();
    expect(within(rows[2]).getByText('Firmă ștearsă')).toBeInTheDocument();
    expect(within(rows[2]).getByText('GAMA SRL')).toBeInTheDocument();
    expect(screen.getByText(/Pagina 1 din 1 · 2 operațiuni/)).toBeInTheDocument();
  });

  it('filters by company and pages through older operations', async () => {
    const { calls } = renderApp(
      '/accountants/1',
      routes(() => ({
        status: 200,
        body: { items: ITEMS, total: 45, page: 1, pageSize: 20 },
      })),
    );
    await screen.findByText('Pagina 1 din 3 · 45 de operațiuni');
    fireEvent.click(screen.getByRole('button', { name: 'Mai vechi' }));
    await vi.waitFor(() =>
      expect(calls).toContain('GET /accountants/1/activity?page=2&pageSize=20'),
    );
    fireEvent.change(screen.getByLabelText('Firma'), {
      target: { value: '7' },
    });
    await vi.waitFor(() =>
      expect(calls).toContain(
        'GET /accountants/1/activity?page=1&pageSize=20&companyId=7',
      ),
    );
  });

  it('says what will appear when nothing was logged yet', async () => {
    renderApp(
      '/accountants/1',
      routes(() => ({
        status: 200,
        body: { items: [], total: 0, page: 1, pageSize: 20 },
      })),
    );
    expect(
      await screen.findByText('Nicio operațiune înregistrată.'),
    ).toBeInTheDocument();
  });
});
