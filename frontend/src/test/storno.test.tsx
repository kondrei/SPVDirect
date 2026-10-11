import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ME, renderApp } from './render';

afterEach(() => vi.unstubAllGlobals());

const SUMMARY = {
  id: 3,
  companyId: 7,
  series: 'FCT',
  number: 12,
  issueDate: '2026-10-04',
  dueDate: null,
  sellerName: 'Agro Vest SRL',
  buyerName: 'CLIENT EXEMPLU SRL',
  buyerCui: '87654321',
  currency: 'RON',
  totalGross: 1210,
  stored: false,
  stornoOfInvoiceId: null,
  stornoOfSeries: null,
  stornoOfNumber: null,
  stornoed: false,
  emailedTo: null,
  emailedAt: null,
};

const LINES = [
  {
    description: 'Servicii de contabilitate',
    quantity: 10,
    unit: 'ore',
    unitPrice: 100,
    vatRate: 21,
    vatCategory: 'S',
    vatExemptionReason: null,
    netAmount: 1000,
  },
  {
    description: 'Consumabile',
    quantity: 2,
    unit: 'buc',
    unitPrice: 5,
    vatRate: 21,
    vatCategory: 'S',
    vatExemptionReason: null,
    netAmount: 10,
  },
];

const detail = (remainingQuantities: number[] | null) => ({
  ...SUMMARY,
  accountantId: 1,
  deliveryDate: '2026-10-04',
  exchangeRate: null,
  paymentMethod: 'transfer',
  vatOnCollection: false,
  seller: {},
  buyer: {},
  lines: LINES,
  totalNet: 1010,
  totalVat: 212.1,
  totalVatRon: 212.1,
  notes: null,
  storagePath: null,
  createdAt: '2026-10-04T10:00:00Z',
  remainingQuantities,
});

const CREATED = {
  invoice: {
    ...detail(null),
    id: 4,
    number: 13,
    totalGross: -1210,
    stornoOfInvoiceId: 3,
    stornoOfSeries: 'FCT',
    stornoOfNumber: 12,
  },
  storageError: null,
  emailError: null,
};

function routes(items: unknown[], remaining: number[] | null = [10, 2]) {
  return {
    'GET /auth/me': { status: 200, body: ME },
    'GET /accountants/1/companies': { status: 200, body: [] },
    'GET /accountants/1/anaf/connections': { status: 200, body: [] },
    'GET /accountants/1/invoices?page=1&pageSize=25': {
      status: 200,
      body: { items, total: items.length, page: 1, pageSize: 25 },
    },
    'GET /accountants/1/invoices/3': { status: 200, body: detail(remaining) },
  };
}

async function openPanel(user: ReturnType<typeof userEvent.setup>) {
  await user.click(
    await screen.findByRole('button', { name: 'Stornează FCT 000012' }),
  );
  await screen.findByRole('heading', { name: 'Stornează factura FCT 000012' });
}

describe('Stornare facturi', () => {
  it('reverses the whole invoice by default', async () => {
    const user = userEvent.setup();
    let sent: Record<string, unknown> = {};
    renderApp('/accountants/1/invoices', {
      ...routes([SUMMARY]),
      'POST /accountants/1/invoices/3/storno': (init) => {
        sent = JSON.parse(String(init?.body));
        return { status: 201, body: CREATED };
      },
    });
    await openPanel(user);
    expect(screen.getByLabelText(/Cantitate de stornat \(ore\)/)).toHaveValue(
      '10',
    );
    expect(screen.getByLabelText(/Cantitate de stornat \(buc\)/)).toHaveValue(
      '2',
    );
    await user.type(
      screen.getByLabelText('Mențiuni (motivul stornării)'),
      'Retur',
    );
    await user.click(
      screen.getByRole('button', { name: 'Emite factura de stornare' }),
    );
    expect(
      await screen.findByText('Factura de stornare FCT 000013 a fost creată.'),
    ).toBeInTheDocument();
    expect(sent).toMatchObject({
      series: 'FCT',
      notes: 'Retur',
      saveToStorage: false,
      sendToEmail: null,
      lines: [
        { lineIndex: 0, quantity: 10 },
        { lineIndex: 1, quantity: 2 },
      ],
    });
  });

  it('reverses only a part: a line left at zero is not sent', async () => {
    const user = userEvent.setup();
    let sent: Record<string, unknown> = {};
    renderApp('/accountants/1/invoices', {
      ...routes([SUMMARY]),
      'POST /accountants/1/invoices/3/storno': (init) => {
        sent = JSON.parse(String(init?.body));
        return { status: 201, body: CREATED };
      },
    });
    await openPanel(user);
    const first = screen.getByLabelText(/Cantitate de stornat \(ore\)/);
    await user.clear(first);
    await user.type(first, '2,5');
    await user.clear(screen.getByLabelText(/Cantitate de stornat \(buc\)/));
    await user.click(
      screen.getByRole('button', { name: 'Emite factura de stornare' }),
    );
    await screen.findByText(/a fost creată\./);
    expect(sent.lines).toEqual([{ lineIndex: 0, quantity: 2.5 }]);
  });

  it('refuses more than what is left, without posting', async () => {
    const user = userEvent.setup();
    const { calls } = renderApp('/accountants/1/invoices', routes([SUMMARY]));
    await openPanel(user);
    const first = screen.getByLabelText(/Cantitate de stornat \(ore\)/);
    await user.clear(first);
    await user.type(first, '11');
    await user.click(
      screen.getByRole('button', { name: 'Emite factura de stornare' }),
    );
    expect(
      await screen.findByText(/Linia 1: cantitatea trebuie să fie între 0 și 10/),
    ).toBeInTheDocument();
    expect(calls.some((c) => c.startsWith('POST'))).toBe(false);
  });

  it('asks for at least one line', async () => {
    const user = userEvent.setup();
    renderApp('/accountants/1/invoices', routes([SUMMARY]));
    await openPanel(user);
    await user.clear(screen.getByLabelText(/Cantitate de stornat \(ore\)/));
    await user.clear(screen.getByLabelText(/Cantitate de stornat \(buc\)/));
    await user.click(
      screen.getByRole('button', { name: 'Emite factura de stornare' }),
    );
    expect(
      await screen.findByText('Alegeți cel puțin o linie de stornat.'),
    ).toBeInTheDocument();
  });

  it('refuses a date before the invoice', async () => {
    const user = userEvent.setup();
    renderApp('/accountants/1/invoices', routes([SUMMARY]));
    await openPanel(user);
    const date = screen.getByLabelText('Data stornării');
    await user.clear(date);
    await user.type(date, '2026-10-01');
    await user.click(
      screen.getByRole('button', { name: 'Emite factura de stornare' }),
    );
    expect(
      await screen.findByText(/nu poate fi înaintea facturii stornate/),
    ).toBeInTheDocument();
  });

  it('sends the storno invoice by email when ticked', async () => {
    const user = userEvent.setup();
    let sent: Record<string, unknown> = {};
    renderApp('/accountants/1/invoices', {
      ...routes([SUMMARY]),
      'POST /accountants/1/invoices/3/storno': (init) => {
        sent = JSON.parse(String(init?.body));
        return {
          status: 201,
          body: { ...CREATED, emailError: 'Emailul nu a putut fi trimis.' },
        };
      },
    });
    await openPanel(user);
    await user.click(
      screen.getByLabelText('Trimite factura de stornare pe email'),
    );
    await user.type(screen.getByLabelText('Trimite la'), 'client@exemplu.ro');
    await user.click(
      screen.getByRole('button', { name: 'Emite factura de stornare' }),
    );
    expect(
      await screen.findByText('Emailul nu a fost trimis.'),
    ).toBeInTheDocument();
    expect(sent.sendToEmail).toBe('client@exemplu.ro');
  });

  it('shows the server error when the storno is refused', async () => {
    const user = userEvent.setup();
    renderApp('/accountants/1/invoices', {
      ...routes([SUMMARY]),
      'POST /accountants/1/invoices/3/storno': {
        status: 409,
        body: { message: 'Factura a fost deja stornată integral' },
      },
    });
    await openPanel(user);
    await user.click(
      screen.getByRole('button', { name: 'Emite factura de stornare' }),
    );
    expect(
      await screen.findByText('Factura a fost deja stornată integral'),
    ).toBeInTheDocument();
  });

  it('says so and blocks issuing when everything was already reversed', async () => {
    const user = userEvent.setup();
    renderApp('/accountants/1/invoices', routes([SUMMARY], [0, 0]));
    await openPanel(user);
    expect(
      screen.getByText('Factura a fost deja stornată integral.'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Emite factura de stornare' }),
    ).toBeDisabled();
  });

  it('marks reversed invoices and storno rows, and cannot reverse a storno', async () => {
    renderApp(
      '/accountants/1/invoices',
      routes([
        {
          ...SUMMARY,
          id: 4,
          number: 13,
          stornoOfInvoiceId: 3,
          stornoOfSeries: 'FCT',
          stornoOfNumber: 12,
        },
        { ...SUMMARY, stornoed: true },
      ]),
    );
    expect(await screen.findByText('Stornare FCT 000012')).toBeInTheDocument();
    expect(screen.getByText('Stornată')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Stornează FCT 000013' }),
    ).not.toBeInTheDocument();
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Stornează FCT 000012' }),
      ).toBeInTheDocument(),
    );
  });
});
