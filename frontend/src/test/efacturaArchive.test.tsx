import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ME, renderApp } from './render';

afterEach(() => vi.unstubAllGlobals());

const COMPANY = { id: 7, name: 'Agro Vest SRL', cui: '12345678' };

const base = {
  'GET /auth/me': { status: 200, body: ME },
  'GET /accountants/1/companies': { status: 200, body: [COMPANY] },
  'GET /accountants/1/anaf/connections': { status: 200, body: [] },
};

function message(id: string, type: string, archivedId: number | null = null) {
  return {
    id,
    requestId: `9${id}`,
    type,
    details: `Factura ${id}`,
    cif: '12345678',
    createdAt: '2026-10-02T08:00:00.000Z',
    createdAtRaw: '202610021100',
    archivedId,
  };
}

const MESSAGES = {
  status: 200,
  body: {
    title: 'Lista',
    messages: [
      message('3001', 'FACTURA PRIMITA'),
      message('3002', 'FACTURA PRIMITA'),
      message('3003', 'FACTURA TRIMISA', 41),
      message('3004', 'ERORI FACTURA'),
    ],
    total: null,
    page: null,
    pages: null,
  },
};

const INVOICE = {
  id: 41,
  companyId: 7,
  anafMessageId: '3001',
  uploadIndex: '93001',
  environment: 'prod',
  direction: 'received',
  standard: 'UBL',
  typeCode: '380',
  creditNote: false,
  number: 'FCT-0042',
  issueDate: '2026-10-02',
  dueDate: '2026-10-30',
  currency: 'RON',
  supplierCui: '555',
  supplierName: 'Gama Distribuție SRL',
  customerCui: '12345678',
  customerName: 'Agro Vest SRL',
  totalNet: 100,
  totalVat: 21,
  totalGross: 121,
  invoiceId: null,
  parseError: null,
  messageCreatedAt: '2026-10-02T08:00:00.000Z',
  createdAt: '2026-10-03T08:00:00.000Z',
};

async function pickCompany(user: ReturnType<typeof userEvent.setup>) {
  await screen.findAllByRole('option', { name: 'Agro Vest SRL' });
  await user.selectOptions(screen.getByLabelText('Firma'), '7');
}

describe('Mesaje e-Factura: import în arhivă', () => {
  it('links archived messages and offers import only for invoices not in the archive', async () => {
    const user = userEvent.setup();
    renderApp('/accountants/1/efactura/messages', {
      ...base,
      'GET /accountants/1/efactura/companies/7/messages?zile=30': MESSAGES,
    });
    await pickCompany(user);
    expect(
      await screen.findByRole('link', { name: 'Deschide din arhivă mesajul 3003' }),
    ).toHaveAttribute('href', '/accountants/1/efactura/archive/41');
    expect(
      screen.getByRole('button', { name: 'Importă mesajul 3001' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Importă mesajul 3003' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Importă mesajul 3004' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('checkbox', { name: 'Alege mesajul 3004' }),
    ).not.toBeInTheDocument();
  });

  it('imports the selected messages and reports what happened', async () => {
    const user = userEvent.setup();
    let sent: unknown = null;
    renderApp('/accountants/1/efactura/messages', {
      ...base,
      'GET /accountants/1/efactura/companies/7/messages?zile=30': MESSAGES,
      'POST /accountants/1/efactura/companies/7/messages/import': (init) => {
        sent = JSON.parse(String(init?.body));
        return {
          status: 200,
          body: [
            { messageId: '3001', status: 'imported', id: 42 },
            {
              messageId: '3002',
              status: 'failed',
              reason: 'Nu aveti dreptul sa descarcati mesajul',
            },
          ],
        };
      },
    });
    await pickCompany(user);
    await user.click(
      await screen.findByRole('checkbox', {
        name: 'Alege toate facturile neimportate',
      }),
    );
    await user.click(screen.getByRole('button', { name: 'Importă selectate (2)' }));
    expect(
      await screen.findByText('1 factură importată · 1 eroare'),
    ).toBeInTheDocument();
    expect(sent).toEqual({ messageIds: ['3001', '3002'] });
    expect(
      screen.getByRole('link', { name: 'Deschide din arhivă mesajul 3001' }),
    ).toHaveAttribute('href', '/accountants/1/efactura/archive/42');
    expect(
      screen.queryByRole('button', { name: 'Importă mesajul 3001' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(/Nu aveti dreptul sa descarcati mesajul/),
    ).toBeInTheDocument();
  });

  it('imports a whole period batch after batch until nothing is left', async () => {
    const user = userEvent.setup();
    const bodies: unknown[] = [];
    let round = 0;
    const { calls } = renderApp('/accountants/1/efactura/messages', {
      ...base,
      'GET /accountants/1/efactura/companies/7/messages?zile=30': MESSAGES,
      'POST /accountants/1/efactura/companies/7/messages/import-period': (init) => {
        bodies.push(JSON.parse(String(init?.body)));
        round++;
        return round === 1
          ? {
              status: 200,
              body: {
                found: 3,
                remaining: 1,
                results: [
                  { messageId: '1', status: 'imported', id: 1 },
                  { messageId: '2', status: 'imported', id: 2 },
                ],
              },
            }
          : {
              status: 200,
              body: {
                found: 1,
                remaining: 0,
                results: [{ messageId: '3002', status: 'imported', id: 43 }],
              },
            };
      },
    });
    await pickCompany(user);
    await user.click(
      await screen.findByRole('button', {
        name: 'Importă toate facturile din ultimele 30 zile',
      }),
    );
    expect(await screen.findByText('3 facturi importate')).toBeInTheDocument();
    expect(bodies).toEqual([{ zile: 30 }, { zile: 30 }]);
    expect(
      screen.getByRole('link', { name: 'Deschide din arhivă mesajul 3002' }),
    ).toHaveAttribute('href', '/accountants/1/efactura/archive/43');
    expect(
      calls.filter((c) =>
        c.startsWith('GET /accountants/1/efactura/companies/7/messages'),
      ),
    ).toHaveLength(1);
  });

  it('stops the period import when a batch makes no progress', async () => {
    const user = userEvent.setup();
    const { calls } = renderApp('/accountants/1/efactura/messages', {
      ...base,
      'GET /accountants/1/efactura/companies/7/messages?zile=30': MESSAGES,
      'POST /accountants/1/efactura/companies/7/messages/import-period': {
        status: 200,
        body: {
          found: 3,
          remaining: 2,
          results: [{ messageId: '1', status: 'failed', reason: 'ANAF indisponibil' }],
        },
      },
    });
    await pickCompany(user);
    await user.click(
      await screen.findByRole('button', {
        name: 'Importă toate facturile din ultimele 30 zile',
      }),
    );
    expect(
      await screen.findByText('Mai sunt 2 facturi de importat; reluați importul.'),
    ).toBeInTheDocument();
    expect(
      calls.filter((c) => c.endsWith('/import-period')),
    ).toHaveLength(1);
  });
});

describe('Arhivă e-Factura', () => {
  const list = (items: unknown[], totals: unknown[] = []) => ({
    status: 200,
    body: { items, total: items.length, page: 1, pageSize: 25, totals },
  });

  it('lists the received invoices with their supplier and the totals', async () => {
    renderApp('/accountants/1/efactura/archive', {
      ...base,
      'GET /accountants/1/efactura/archive?direction=received&page=1&pageSize=25':
        list([INVOICE], [{ currency: 'RON', count: 1, total: 121 }]),
    });
    expect(
      await screen.findByRole('link', { name: 'Deschide Factura FCT-0042' }),
    ).toHaveAttribute('href', '/accountants/1/efactura/archive/41');
    expect(screen.getByText('Gama Distribuție SRL')).toBeInTheDocument();
    expect(screen.getByText('RO 555')).toBeInTheDocument();
    expect(screen.getAllByText('121,00 RON').length).toBeGreaterThan(0);
    expect(screen.getByRole('tab', { name: 'Facturi primite' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('switches to sent invoices and searches by number or partner', async () => {
    const user = userEvent.setup();
    const { calls } = renderApp('/accountants/1/efactura/archive', {
      ...base,
      'GET /accountants/1/efactura/archive?direction=received&page=1&pageSize=25':
        list([]),
      'GET /accountants/1/efactura/archive?direction=sent&page=1&pageSize=25':
        list([{ ...INVOICE, direction: 'sent', invoiceId: 3 }]),
      'GET /accountants/1/efactura/archive?direction=sent&page=1&pageSize=25&q=gama':
        list([]),
    });
    expect(
      await screen.findByText('Nicio factură primită în arhivă.'),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: 'Facturi trimise' }));
    expect(await screen.findByText('Emisă în SPVDirect')).toBeInTheDocument();
    expect(screen.getByText('Agro Vest SRL', { selector: 'div' })).toBeInTheDocument();
    await user.type(screen.getByLabelText('Caută'), 'gama');
    await user.click(screen.getByRole('button', { name: 'Caută' }));
    await waitFor(() =>
      expect(calls).toContain(
        'GET /accountants/1/efactura/archive?direction=sent&page=1&pageSize=25&q=gama',
      ),
    );
  });

  it('takes the company filter from the URL', async () => {
    const { calls } = renderApp('/accountants/1/efactura/archive?companyId=7', {
      ...base,
      'GET /accountants/1/efactura/archive?direction=received&page=1&pageSize=25&companyId=7':
        list([]),
    });
    await screen.findByText('Nicio factură primită în arhivă.');
    expect(calls).toContain(
      'GET /accountants/1/efactura/archive?direction=received&page=1&pageSize=25&companyId=7',
    );
  });
});

describe('Factură din arhivă', () => {
  const detail = (extra: Record<string, unknown> = {}) => ({
    status: 200,
    body: {
      ...INVOICE,
      lines: [
        {
          name: 'Consultanță',
          quantity: 2,
          unitCode: 'H87',
          unitPrice: 50,
          vatCategory: 'S',
          vatPercent: 21,
          net: 100,
        },
      ],
      ...extra,
    },
  });

  it('shows the parties, the values and the lines', async () => {
    renderApp('/accountants/1/efactura/archive/41', {
      ...base,
      'GET /accountants/1/efactura/archive/41': detail(),
    });
    expect(
      await screen.findByRole('heading', { name: 'Factura FCT-0042' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Gama Distribuție SRL')).toBeInTheDocument();
    expect(screen.getByText('Consultanță')).toBeInTheDocument();
    expect(screen.getByText('2 H87')).toBeInTheDocument();
    expect(screen.getByText('121,00 RON')).toBeInTheDocument();
    expect(screen.getByText('30.10.2026')).toBeInTheDocument();
  });

  it('warns when the XML could not be read completely', async () => {
    renderApp('/accountants/1/efactura/archive/41', {
      ...base,
      'GET /accountants/1/efactura/archive/41': detail({
        parseError: 'Nu s-au putut citi din factură: numărul',
        number: null,
        lines: [],
      }),
    });
    expect(
      await screen.findByText('Factura nu a putut fi citită complet.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Factura nu are linii citite.')).toBeInTheDocument();
  });

  it('emails the invoice with an optional note', async () => {
    const user = userEvent.setup();
    let sent: unknown = null;
    const { calls } = renderApp('/accountants/1/efactura/archive/41', {
      ...base,
      'GET /accountants/1/efactura/archive/41': detail(),
      'POST /accountants/1/efactura/archive/41/email': (init) => {
        sent = JSON.parse(String(init?.body));
        return { status: 200, body: { to: 'client@example.com', withPdf: true } };
      },
    });
    await user.click(
      await screen.findByRole('button', { name: 'Trimite pe email' }),
    );
    const panel = screen
      .getByRole('heading', { name: 'Trimite factura fct-0042' })
      .closest('section') as HTMLElement;
    await user.click(within(panel).getByRole('button', { name: 'Trimite' }));
    expect(
      within(panel).getByText('Introduceți o adresă de email validă.'),
    ).toBeInTheDocument();
    expect(calls.some((c) => c.startsWith('POST'))).toBe(false);
    await user.type(within(panel).getByLabelText('Adresa de email'), 'client@example.com');
    await user.type(within(panel).getByLabelText('Mesaj (opțional)'), 'Pentru dosar');
    await user.click(within(panel).getByRole('button', { name: 'Trimite' }));
    expect(
      await within(panel).findByText('Emailul a fost trimis la client@example.com.'),
    ).toBeInTheDocument();
    expect(sent).toEqual({ to: 'client@example.com', message: 'Pentru dosar' });
  });
});
