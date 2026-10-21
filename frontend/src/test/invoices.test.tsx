import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ME, renderApp } from './render';

afterEach(() => vi.unstubAllGlobals());

const company = (over: Record<string, unknown> = {}) => ({
  id: 7,
  accountantId: 1,
  cui: '14399840',
  name: 'Agro Vest SRL',
  anafConnectionId: null,
  regCom: 'J35/100/2010',
  address: 'JUD. TIMIŞ, MUN. TIMIŞOARA, STR. EXEMPLU, NR.1',
  caenCode: null,
  caen: null,
  registrationStatus: null,
  vatPayer: true,
  vatOnCollection: false,
  splitVat: false,
  eFactura: true,
  inactive: false,
  iban: null,
  bankName: null,
  email: null,
  phone: null,
  hasLogo: false,
  anafData: null,
  anafSyncedAt: null,
  createdAt: '2026-09-01T00:00:00Z',
  updatedAt: '2026-09-01T00:00:00Z',
  ...over,
});

const SUMMARY = {
  id: 3,
  companyId: 7,
  series: 'FCT',
  number: 12,
  issueDate: '2026-10-04',
  dueDate: '2026-10-30',
  sellerName: 'Agro Vest SRL',
  buyerName: 'CLIENT EXEMPLU SRL',
  buyerCui: '87654321',
  currency: 'RON',
  totalGross: 1210.5,
  stored: false,
  emailedTo: null,
  emailedAt: null,
};

const BUYER = {
  name: 'CLIENT EXEMPLU SRL',
  cui: '87654321',
  regCom: 'J40/1/2015',
  address: 'MUN. BUCUREŞTI, SECTOR 3, STR. CLIENT, NR.2',
  street: 'Str. Client, nr. 2',
  city: 'SECTOR3',
  county: 'RO-B',
  postalCode: '030001',
  iban: 'RO49AAAA1B31007593840000',
  bank: null,
  email: null,
  phone: '0211000000',
  vatPayer: true,
  inactive: false,
  eFactura: true,
};

const CREATED = {
  invoice: {
    ...SUMMARY,
    accountantId: 1,
    deliveryDate: '2026-10-04',
    exchangeRate: null,
    paymentMethod: 'transfer',
    vatOnCollection: false,
    seller: BUYER,
    buyer: BUYER,
    lines: [],
    totalNet: 1000,
    totalVat: 210,
    totalVatRon: 210,
    notes: null,
    storagePath: null,
    createdAt: '2026-10-04T10:00:00Z',
    emailedTo: null,
    totalGross: 1210,
  },
  storageError: null,
  emailError: null,
};

const base = (companies = [company()]) => ({
  'GET /auth/me': { status: 200, body: ME },
  'GET /accountants/1/companies': { status: 200, body: companies },
  'GET /accountants/1/anaf/connections': { status: 200, body: [] },
  'GET /accountants/1/invoices/next-number?companyId=7&series=FCT': {
    status: 200,
    body: { number: 13 },
  },
});

describe('Facturi list', () => {
  it('lists the issued invoices', async () => {
    renderApp('/accountants/1/invoices', {
      ...base(),
      'GET /accountants/1/invoices?page=1&pageSize=25': {
        status: 200,
        body: { items: [SUMMARY], total: 1, page: 1, pageSize: 25 },
      },
    });
    expect(await screen.findByText('FCT 000012')).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Emitent' })).toBeInTheDocument();
    expect(screen.getByText('Agro Vest SRL', { selector: 'td' })).toBeInTheDocument();
    expect(screen.getByText('CLIENT EXEMPLU SRL')).toBeInTheDocument();
    expect(screen.getByText('1.210,50 RON')).toBeInTheDocument();
    expect(screen.getByText('04.10.2026')).toBeInTheDocument();
    expect(screen.getByText(/Pagina 1 din 1 · 1 factură/)).toBeInTheDocument();
  });

  it('drops the issuer column once a company is chosen', async () => {
    const user = userEvent.setup();
    renderApp('/accountants/1/invoices', {
      ...base(),
      'GET /accountants/1/invoices?page=1&pageSize=25': {
        status: 200,
        body: { items: [SUMMARY], total: 1, page: 1, pageSize: 25 },
      },
      'GET /accountants/1/invoices?page=1&pageSize=25&companyId=7': {
        status: 200,
        body: { items: [SUMMARY], total: 1, page: 1, pageSize: 25 },
      },
    });
    await screen.findByText('FCT 000012');
    await screen.findAllByRole('option', { name: 'Agro Vest SRL' });
    await user.selectOptions(screen.getByLabelText('Firma emitentă'), '7');
    await waitFor(() =>
      expect(
        screen.queryByRole('columnheader', { name: 'Emitent' }),
      ).not.toBeInTheDocument(),
    );
  });

  it('invites to issue the first invoice when there is none', async () => {
    renderApp('/accountants/1/invoices', {
      ...base(),
      'GET /accountants/1/invoices?page=1&pageSize=25': {
        status: 200,
        body: { items: [], total: 0, page: 1, pageSize: 25 },
      },
    });
    expect(await screen.findByText('Nicio factură emisă.')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Emite prima factură' }),
    ).toHaveAttribute('href', '/accountants/1/invoices/new');
  });

  it('sends the invoice to a typed address', async () => {
    const user = userEvent.setup();
    let body: unknown;
    renderApp('/accountants/1/invoices', {
      ...base(),
      'GET /accountants/1/invoices?page=1&pageSize=25': {
        status: 200,
        body: { items: [SUMMARY], total: 1, page: 1, pageSize: 25 },
      },
      'POST /accountants/1/invoices/3/send': (init) => {
        body = JSON.parse(String(init?.body));
        return { status: 200, body: {} };
      },
    });
    await user.click(
      await screen.findByRole('button', { name: /Trimite pe email FCT 000012/ }),
    );
    await user.type(screen.getByLabelText('Adresa de email'), 'client@exemplu.ro');
    await user.click(screen.getByRole('button', { name: 'Trimite' }));
    expect(await screen.findByText('Emailul a fost trimis.')).toBeInTheDocument();
    expect(body).toEqual({ to: 'client@exemplu.ro' });
  });

  describe('preview', () => {
    const listApi = () => ({
      ...base(),
      'GET /accountants/1/invoices?page=1&pageSize=25': {
        status: 200,
        body: { items: [SUMMARY], total: 1, page: 1, pageSize: 25 },
      },
      'GET /accountants/1/invoices/3/pdf': { status: 200, body: {} },
    });

    function stubObjectUrls() {
      const create = vi.fn(() => 'blob:factura-3');
      const revoke = vi.fn();
      Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke });
      return { create, revoke };
    }

    it('opens the PDF of the invoice clicked in the list and closes it again', async () => {
      const user = userEvent.setup();
      const { revoke } = stubObjectUrls();
      const { calls } = renderApp('/accountants/1/invoices', listApi());
      await user.click(await screen.findByRole('button', { name: 'Previzualizează FCT 000012' }));

      const dialog = screen.getByRole('dialog', { name: 'Factura FCT 000012' });
      expect(dialog).toHaveFocus();
      expect(within(dialog).getByText(/CLIENT EXEMPLU SRL · 04.10.2026 · 1.210,50 RON/)).toBeInTheDocument();
      expect(
        await within(dialog).findByTitle('Previzualizare factura FCT 000012'),
      ).toHaveAttribute('src', 'blob:factura-3');
      expect(calls).toContain('GET /accountants/1/invoices/3/pdf');

      await user.click(within(dialog).getByRole('button', { name: 'Închide' }));
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(revoke).toHaveBeenCalledWith('blob:factura-3');
      expect(screen.getByRole('button', { name: 'Previzualizează FCT 000012' })).toHaveFocus();
    });

    it('opens from a click anywhere on the row and closes with Escape', async () => {
      const user = userEvent.setup();
      stubObjectUrls();
      renderApp('/accountants/1/invoices', listApi());
      await user.click(await screen.findByText('CLIENT EXEMPLU SRL'));
      expect(screen.getByRole('dialog', { name: 'Factura FCT 000012' })).toBeInTheDocument();
      await user.keyboard('{Escape}');
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('does not open when an action button of the invoice is used', async () => {
      const user = userEvent.setup();
      stubObjectUrls();
      renderApp('/accountants/1/invoices', listApi());
      await user.click(
        await screen.findByRole('button', { name: /Trimite pe email FCT 000012/ }),
      );
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('says so when the PDF cannot be loaded', async () => {
      const user = userEvent.setup();
      stubObjectUrls();
      renderApp('/accountants/1/invoices', {
        ...listApi(),
        'GET /accountants/1/invoices/3/pdf': {
          status: 404,
          body: { message: 'Factura nu a fost găsită' },
        },
      });
      await user.click(await screen.findByRole('button', { name: 'Previzualizează FCT 000012' }));
      expect(await screen.findByText('Factura nu a putut fi afișată.')).toBeInTheDocument();
    });
  });

  it('saves a not yet stored invoice to storage', async () => {
    const user = userEvent.setup();
    const { calls } = renderApp('/accountants/1/invoices', {
      ...base(),
      'GET /accountants/1/invoices?page=1&pageSize=25': {
        status: 200,
        body: { items: [SUMMARY], total: 1, page: 1, pageSize: 25 },
      },
      'POST /accountants/1/invoices/3/store': { status: 200, body: {} },
    });
    await user.click(
      await screen.findByRole('button', {
        name: /Salvează în cloud FCT 000012/,
      }),
    );
    await waitFor(() =>
      expect(calls).toContain('POST /accountants/1/invoices/3/store'),
    );
  });
});

describe('Factură nouă', () => {
  async function fillBasics(user: ReturnType<typeof userEvent.setup>) {
    await user.type(screen.getByLabelText('CUI'), 'RO 87654321');
    await user.click(screen.getByRole('button', { name: 'Caută la ANAF' }));
    await waitFor(() =>
      expect(screen.getByLabelText('Denumire')).toHaveValue('CLIENT EXEMPLU SRL'),
    );
    await user.type(screen.getByLabelText('Denumire (linia 1)'), 'Servicii');
    await user.type(
      screen.getByLabelText('Preț unitar (RON, fără TVA)'),
      '1000',
    );
  }

  it('fills the buyer from ANAF and creates the invoice', async () => {
    const user = userEvent.setup();
    let sent: Record<string, unknown> = {};
    renderApp('/accountants/1/invoices/new', {
      ...base(),
      'GET /accountants/1/invoices/buyer-lookup/87654321': {
        status: 200,
        body: BUYER,
      },
      'POST /accountants/1/invoices': (init) => {
        sent = JSON.parse(String(init?.body));
        return { status: 201, body: CREATED };
      },
    });
    await screen.findByRole('heading', { name: 'Factură nouă' });
    await fillBasics(user);

    expect(screen.getByLabelText('Adresa')).toHaveValue(BUYER.address);
    expect(screen.getByLabelText('IBAN')).toHaveValue(BUYER.iban);
    expect(screen.getByText('Plătitor de TVA')).toBeInTheDocument();
    expect(screen.getByText(/Total de plată/).nextElementSibling).toHaveTextContent(
      '1.210,00 RON',
    );

    await user.click(screen.getByRole('button', { name: 'Emite factura' }));
    expect(
      await screen.findByText('Factura FCT 000012 a fost creată.'),
    ).toBeInTheDocument();

    expect(sent).toMatchObject({
      companyId: 7,
      series: 'FCT',
      currency: 'RON',
      exchangeRate: null,
      paymentMethod: 'transfer',
      saveToStorage: false,
      sendToEmail: null,
      buyer: {
        name: 'CLIENT EXEMPLU SRL',
        cui: '87654321',
        city: 'SECTOR3',
        county: 'RO-B',
        vatPayer: true,
      },
      lines: [
        {
          description: 'Servicii',
          quantity: 1,
          unit: 'serviciu',
          unitPrice: 1000,
          vatRate: 21,
        },
      ],
    });
    expect(sent).not.toHaveProperty('number');
  });

  it('offers validate, ANAF upload and the other actions once the invoice is issued', async () => {
    const user = userEvent.setup();
    renderApp('/accountants/1/invoices/new', {
      ...base(),
      'GET /accountants/1/invoices/buyer-lookup/87654321': {
        status: 200,
        body: BUYER,
      },
      'POST /accountants/1/invoices': { status: 201, body: CREATED },
      'POST /accountants/1/efactura/invoices/3/validate': {
        status: 200,
        body: { valid: false, messages: ['E: BR-CO-25'], traceId: null },
      },
      'POST /accountants/1/efactura/invoices/3/upload': {
        status: 201,
        body: {
          id: 1,
          invoiceId: 3,
          status: 'processing',
          uploadIndex: '5001',
          errorMessage: null,
        },
      },
    });
    await screen.findByRole('heading', { name: 'Factură nouă' });
    await fillBasics(user);
    await user.click(screen.getByRole('button', { name: 'Emite factura' }));
    await screen.findByText('Factura FCT 000012 a fost creată.');

    await user.click(screen.getByRole('button', { name: 'Validează XML' }));
    const log = await screen.findByText(/E: BR-CO-25/);
    expect(log.closest('.spv-alert')).not.toBeNull();

    await user.click(screen.getByRole('button', { name: 'Trimite la ANAF' }));
    expect(
      await screen.findByText(/Factura a fost trimisă la ANAF. Index: 5001/),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Trimite la ANAF' }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Trimite pe email' }));
    expect(
      await screen.findByRole('heading', { name: 'Trimite factura FCT 000012' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Stornează' })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Salvează în cloud' }),
    ).toBeInTheDocument();
  });

  it('asks to save to storage and to email the buyer when ticked', async () => {
    const user = userEvent.setup();
    let sent: Record<string, unknown> = {};
    renderApp('/accountants/1/invoices/new', {
      ...base(),
      'GET /accountants/1/invoices/buyer-lookup/87654321': {
        status: 200,
        body: BUYER,
      },
      'POST /accountants/1/invoices': (init) => {
        sent = JSON.parse(String(init?.body));
        return {
          status: 201,
          body: { ...CREATED, emailError: 'Emailul nu a putut fi trimis.' },
        };
      },
    });
    await screen.findByRole('heading', { name: 'Factură nouă' });
    await fillBasics(user);
    await user.click(screen.getByLabelText('Salvează PDF-ul în cloud'));
    await user.click(
      screen.getByLabelText('Trimite factura pe email cumpărătorului'),
    );
    await user.type(screen.getByLabelText('Trimite la'), 'client@exemplu.ro');
    await user.click(screen.getByRole('button', { name: 'Emite factura' }));

    expect(
      await screen.findByText('Emailul nu a fost trimis.'),
    ).toBeInTheDocument();
    expect(sent).toMatchObject({
      saveToStorage: true,
      sendToEmail: 'client@exemplu.ro',
    });
  });

  it('shows the lookup error and keeps the form usable', async () => {
    const user = userEvent.setup();
    renderApp('/accountants/1/invoices/new', {
      ...base(),
      'GET /accountants/1/invoices/buyer-lookup/99999999': {
        status: 400,
        body: { message: 'CUI incorect: nu există nicio firmă cu acest CUI.' },
      },
    });
    await screen.findByRole('heading', { name: 'Factură nouă' });
    await user.type(screen.getByLabelText('CUI'), '99999999');
    await user.click(screen.getByRole('button', { name: 'Caută la ANAF' }));
    expect(
      await screen.findByText(/CUI incorect: nu există nicio firmă/),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Denumire')).toBeEnabled();
  });

  it('shows example placeholders in the text fields', async () => {
    renderApp('/accountants/1/invoices/new', base());
    await screen.findByRole('heading', { name: 'Factură nouă' });
    expect(screen.getByLabelText('Denumire')).toHaveAttribute('placeholder', 'Exemplu SRL');
    expect(screen.getByLabelText('IBAN')).toHaveAttribute('placeholder');
    expect(screen.getByLabelText('Denumire (linia 1)')).toHaveAttribute('placeholder');
    expect(screen.getByLabelText('Mențiuni pe factură')).toHaveAttribute('placeholder');
  });

  it('rejects an invalid CUI without calling ANAF', async () => {
    const user = userEvent.setup();
    const { calls } = renderApp('/accountants/1/invoices/new', base());
    await screen.findByRole('heading', { name: 'Factură nouă' });
    await user.type(screen.getByLabelText('CUI'), '12');
    await user.clear(screen.getByLabelText('CUI'));
    await user.type(screen.getByLabelText('CUI'), 'abc');
    await user.click(screen.getByRole('button', { name: 'Caută la ANAF' }));
    const cui = screen.getByLabelText('CUI');
    expect(cui).toHaveAccessibleDescription(/CUI invalid/);
    expect(cui).toHaveAttribute('aria-invalid', 'true');
    expect(calls.some((c) => c.includes('buyer-lookup'))).toBe(false);
    await user.type(cui, '1');
    expect(cui).toHaveAccessibleDescription('Lăsați gol pentru persoane fizice.');
  });

  it('validates the lines before posting', async () => {
    const user = userEvent.setup();
    const { calls } = renderApp('/accountants/1/invoices/new', base());
    await screen.findByRole('heading', { name: 'Factură nouă' });
    await user.type(screen.getByLabelText('Denumire'), 'Ion Popescu');
    await user.type(screen.getByLabelText('Adresa'), 'Str. A, nr. 1');
    await user.click(screen.getByRole('button', { name: 'Emite factura' }));
    expect(
      await screen.findByText('Linia 1: completați denumirea.'),
    ).toBeInTheDocument();
    expect(calls).not.toContain('POST /accountants/1/invoices');
  });

  it('offers no VAT rate for a company that is not a VAT payer', async () => {
    renderApp('/accountants/1/invoices/new', {
      ...base([company({ vatPayer: false })]),
    });
    expect(
      await screen.findByText('Firma nu este plătitoare de TVA.'),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText('Cota TVA')).not.toBeInTheDocument();
  });

  it('asks for a reason when the VAT rate is 0%', async () => {
    const user = userEvent.setup();
    renderApp('/accountants/1/invoices/new', base());
    await screen.findByRole('heading', { name: 'Factură nouă' });
    expect(screen.queryByLabelText('Motiv cotă 0%')).not.toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Cota TVA'), '0');
    expect(screen.getByLabelText('Motiv cotă 0%')).toHaveValue('E');
  });

  it('requires the BNR rate for a foreign currency', async () => {
    const user = userEvent.setup();
    renderApp('/accountants/1/invoices/new', base());
    await screen.findByRole('heading', { name: 'Factură nouă' });
    await user.selectOptions(screen.getByLabelText('Moneda'), 'EUR');
    expect(screen.getByLabelText(/Curs BNR/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Emite factura' }));
    expect(await screen.findByText(/Introduceți cursul BNR/)).toBeInTheDocument();
  });

  it('asks to add a company first when there is none', async () => {
    renderApp('/accountants/1/invoices/new', base([]));
    expect(
      await screen.findByText('Adăugați întâi o firmă.'),
    ).toBeInTheDocument();
  });

  it('blocks issuing for a company without address', async () => {
    renderApp('/accountants/1/invoices/new', {
      ...base([company({ address: null })]),
    });
    expect(await screen.findByText('Firma nu are adresă.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Emite factura' })).toBeDisabled();
  });

  describe('buyer filled when the CUI field is left', () => {
    const FOUND = '/accountants/1/invoices/buyers/87654321';

    it('fills the buyer from the last invoice to that CUI without asking ANAF', async () => {
      const user = userEvent.setup();
      const { calls } = renderApp('/accountants/1/invoices/new', {
        ...base(),
        [`GET ${FOUND}`]: {
          status: 200,
          body: {
            ...BUYER,
            email: 'client@exemplu.ro',
            anafChecked: true,
            source: 'invoice',
          },
        },
      });
      await screen.findByRole('heading', { name: 'Factură nouă' });
      await user.type(screen.getByLabelText('CUI'), 'RO 87654321');
      await user.tab();

      await waitFor(() =>
        expect(screen.getByLabelText('Denumire')).toHaveValue('CLIENT EXEMPLU SRL'),
      );
      expect(screen.getByLabelText('Adresa')).toHaveValue(BUYER.address);
      expect(screen.getByLabelText('IBAN')).toHaveValue(BUYER.iban);
      expect(screen.getByLabelText('Email')).toHaveValue('client@exemplu.ro');
      expect(screen.getByText('Plătitor de TVA')).toBeInTheDocument();
      expect(screen.getByText('Înregistrat în RO e-Factura')).toBeInTheDocument();
      expect(screen.queryByText('Status neverificat la ANAF')).not.toBeInTheDocument();
      expect(
        screen.getByText(
          'Date preluate din ultima factură emisă acestui client, cu statusul actual din ANAF.',
        ),
      ).toBeInTheDocument();
      expect(calls.filter((c) => c.includes('buyer-lookup'))).toEqual([]);

      await user.click(screen.getByLabelText('CUI'));
      await user.tab();
      expect(calls.filter((c) => c === `GET ${FOUND}`)).toHaveLength(1);
    });

    it('flags the status as not checked when ANAF did not answer for a saved buyer', async () => {
      const user = userEvent.setup();
      renderApp('/accountants/1/invoices/new', {
        ...base(),
        [`GET ${FOUND}`]: {
          status: 200,
          body: {
            ...BUYER,
            inactive: null,
            eFactura: null,
            anafChecked: false,
            source: 'invoice',
          },
        },
      });
      await screen.findByRole('heading', { name: 'Factură nouă' });
      await user.type(screen.getByLabelText('CUI'), '87654321');
      await user.tab();
      expect(await screen.findByText('Status neverificat la ANAF')).toBeInTheDocument();
      expect(screen.getByText(/ANAF nu a răspuns/)).toBeInTheDocument();
      expect(screen.queryByText(/RO e-Factura/)).not.toBeInTheDocument();
    });

    it('shows a buyer that is not registered in RO e-Factura', async () => {
      const user = userEvent.setup();
      renderApp('/accountants/1/invoices/new', {
        ...base(),
        [`GET ${FOUND}`]: {
          status: 200,
          body: { ...BUYER, eFactura: false, anafChecked: true, source: 'anaf' },
        },
      });
      await screen.findByRole('heading', { name: 'Factură nouă' });
      await user.type(screen.getByLabelText('CUI'), '87654321');
      await user.tab();
      expect(await screen.findByText('Neînregistrat în RO e-Factura')).toBeInTheDocument();
    });

    it('says where the data came from when the backend had to ask ANAF', async () => {
      const user = userEvent.setup();
      renderApp('/accountants/1/invoices/new', {
        ...base(),
        [`GET ${FOUND}`]: { status: 200, body: { ...BUYER, source: 'anaf' } },
      });
      await screen.findByRole('heading', { name: 'Factură nouă' });
      await user.type(screen.getByLabelText('CUI'), '87654321');
      await user.tab();
      expect(await screen.findByText('Date preluate din ANAF.')).toBeInTheDocument();
      expect(screen.getByLabelText('Denumire')).toHaveValue('CLIENT EXEMPLU SRL');
    });

    it('shows why when the CUI is found nowhere', async () => {
      const user = userEvent.setup();
      renderApp('/accountants/1/invoices/new', {
        ...base(),
        [`GET ${FOUND}`]: {
          status: 400,
          body: { message: 'CUI-ul nu există în registrul ANAF.' },
        },
      });
      await screen.findByRole('heading', { name: 'Factură nouă' });
      await user.type(screen.getByLabelText('CUI'), '87654321');
      await user.tab();
      expect(await screen.findByText('Clientul nu a fost găsit.')).toBeInTheDocument();
      expect(screen.getByText('CUI-ul nu există în registrul ANAF.')).toBeInTheDocument();
    });

    it('does not search on leaving an empty or invalid CUI, nor when Caută la ANAF is clicked', async () => {
      const user = userEvent.setup();
      const { calls } = renderApp('/accountants/1/invoices/new', {
        ...base(),
        'GET /accountants/1/invoices/buyer-lookup/87654321': { status: 200, body: BUYER },
      });
      await screen.findByRole('heading', { name: 'Factură nouă' });
      await user.click(screen.getByLabelText('CUI'));
      await user.tab();
      await user.type(screen.getByLabelText('CUI'), 'RO 1');
      await user.tab();
      await user.clear(screen.getByLabelText('CUI'));
      await user.type(screen.getByLabelText('CUI'), '87654321');
      await user.click(screen.getByRole('button', { name: 'Caută la ANAF' }));
      expect(await screen.findByText('Date preluate din ANAF.')).toBeInTheDocument();
      expect(calls.filter((c) => c.includes('/invoices/buyers/'))).toEqual([]);
    });

    it('still fills on leaving the CUI after a press on Caută la ANAF that did not click', async () => {
      const user = userEvent.setup();
      const { calls } = renderApp('/accountants/1/invoices/new', {
        ...base(),
        [`GET ${FOUND}`]: { status: 200, body: { ...BUYER, source: 'invoice' } },
      });
      await screen.findByRole('heading', { name: 'Factură nouă' });
      const searchButton = screen.getByRole('button', { name: 'Caută la ANAF' });
      fireEvent.pointerDown(searchButton);
      await user.type(screen.getByLabelText('CUI'), '87654321');
      await user.tab();
      await waitFor(() => expect(calls).toContain(`GET ${FOUND}`));

      await user.clear(screen.getByLabelText('CUI'));
      await user.type(screen.getByLabelText('CUI'), '12345678');
      fireEvent.pointerDown(searchButton);
      fireEvent.pointerCancel(searchButton);
      await user.tab();
      await waitFor(() =>
        expect(calls).toContain('GET /accountants/1/invoices/buyers/12345678'),
      );
    });
  });

  describe('lines billed before to the same buyer', () => {
    const SUGGESTION_LIST = 'Facturate anterior acestui client';
    const SUGGESTIONS = [
      {
        description: 'Servicii de contabilitate',
        quantity: 1,
        unit: 'luni',
        unitPrice: 1500.5,
        vatRate: 21,
        vatCategory: 'S',
        currency: 'RON',
        issueDate: '2026-09-30',
      },
      {
        description: 'Chirie birou',
        quantity: 2,
        unit: 'luni',
        unitPrice: 800,
        vatRate: 0,
        vatCategory: 'E',
        currency: 'RON',
        issueDate: '2026-09-30',
      },
      {
        description: 'Consultanță externă',
        quantity: 3,
        unit: 'ore',
        unitPrice: 100,
        vatRate: 21,
        vatCategory: 'S',
        currency: 'EUR',
        issueDate: '2026-08-31',
      },
    ];

    const api = (extra: Record<string, unknown> = {}) => ({
      ...base(),
      'GET /accountants/1/invoices/line-suggestions?companyId=7&buyerCui=87654321': {
        status: 200,
        body: SUGGESTIONS,
      },
      ...extra,
    });

    it('lists them when the description is clicked and fills the line from the one picked', async () => {
      const user = userEvent.setup();
      let sent: Record<string, unknown> = {};
      renderApp(
        '/accountants/1/invoices/new',
        api({
          'GET /accountants/1/invoices/buyer-lookup/87654321': {
            status: 200,
            body: BUYER,
          },
          'POST /accountants/1/invoices': (init: RequestInit | undefined) => {
            sent = JSON.parse(String(init?.body));
            return { status: 201, body: CREATED };
          },
        }),
      );
      await screen.findByRole('heading', { name: 'Factură nouă' });
      await user.type(screen.getByLabelText('CUI'), 'RO 87654321');
      await user.click(screen.getByRole('button', { name: 'Caută la ANAF' }));
      await waitFor(() =>
        expect(screen.getByLabelText('Denumire')).toHaveValue('CLIENT EXEMPLU SRL'),
      );

      const description = screen.getByLabelText('Denumire (linia 1)');
      await waitFor(async () => {
        await user.click(description);
        expect(screen.getByRole('list', { name: SUGGESTION_LIST })).toBeInTheDocument();
      });
      const list = screen.getByRole('list', { name: SUGGESTION_LIST });
      const options = within(list).getAllByRole('button');
      expect(options.map((o) => o.textContent)).toEqual([
        expect.stringContaining('Servicii de contabilitate'),
        expect.stringContaining('Chirie birou'),
      ]);
      expect(options[0]).toHaveTextContent('1 luni × 1.500,50 RON · ultima dată 30.09.2026');

      await user.click(options[0]);
      expect(screen.queryByRole('list', { name: SUGGESTION_LIST })).not.toBeInTheDocument();
      expect(description).toHaveValue('Servicii de contabilitate');
      expect(screen.getByLabelText('Cantitate')).toHaveValue('1');
      expect(screen.getByLabelText('U.M.')).toHaveValue('luni');
      expect(screen.getByLabelText('Preț unitar (RON, fără TVA)')).toHaveValue('1500,5');

      await user.clear(screen.getByLabelText('Cantitate'));
      await user.type(screen.getByLabelText('Cantitate'), '3');
      await user.click(screen.getByRole('button', { name: 'Emite factura' }));
      await screen.findByText('Factura FCT 000012 a fost creată.');
      expect(sent.lines).toEqual([
        {
          description: 'Servicii de contabilitate',
          quantity: 3,
          unit: 'luni',
          unitPrice: 1500.5,
          vatRate: 21,
        },
      ]);
    });

    it('filters by the typed text, picks with the keyboard and keeps a 0% reason', async () => {
      const user = userEvent.setup();
      renderApp('/accountants/1/invoices/new', api());
      await screen.findByRole('heading', { name: 'Factură nouă' });
      await user.type(screen.getByLabelText('CUI'), '87654321');

      const description = screen.getByLabelText('Denumire (linia 1)');
      await waitFor(async () => {
        await user.click(description);
        expect(screen.getByRole('list', { name: SUGGESTION_LIST })).toBeInTheDocument();
      });
      await user.type(description, 'chir');
      const options = within(screen.getByRole('list', { name: SUGGESTION_LIST })).getAllByRole('button');
      expect(options).toHaveLength(1);

      await user.keyboard('{ArrowDown}{Enter}');
      expect(description).toHaveValue('Chirie birou');
      expect(screen.getByLabelText('Cantitate')).toHaveValue('2');
      expect(screen.getByLabelText('Cota TVA')).toHaveValue('0');
      expect(screen.getByLabelText('Motiv cotă 0%')).toHaveValue('E');
    });

    it('lists them when Denumire is reached with the keyboard and typed into', async () => {
      const user = userEvent.setup();
      renderApp('/accountants/1/invoices/new', api());
      await screen.findByRole('heading', { name: 'Factură nouă' });
      await user.type(screen.getByLabelText('CUI'), '87654321');
      const description = screen.getByLabelText('Denumire (linia 1)');
      description.focus();
      await user.keyboard('serv');
      const list = await screen.findByRole('list', { name: SUGGESTION_LIST });
      expect(within(list).getAllByRole('button')).toHaveLength(1);
    });

    it('asks for them only when Denumire is used with a valid buyer CUI', async () => {
      const user = userEvent.setup();
      const { calls } = renderApp('/accountants/1/invoices/new', api());
      const asked = () => calls.filter((c) => c.includes('line-suggestions')).length;
      await screen.findByRole('heading', { name: 'Factură nouă' });
      const description = screen.getByLabelText('Denumire (linia 1)');

      await user.click(description);
      expect(screen.queryByRole('list', { name: SUGGESTION_LIST })).not.toBeInTheDocument();
      expect(asked()).toBe(0);

      await user.type(screen.getByLabelText('CUI'), 'RO 87654321');
      await new Promise((resolve) => setTimeout(resolve, 600));
      expect(asked()).toBe(0);

      await user.click(description);
      expect(
        await screen.findByRole('list', { name: SUGGESTION_LIST }),
      ).toBeInTheDocument();
      expect(calls).toContain(
        'GET /accountants/1/invoices/line-suggestions?companyId=7&buyerCui=87654321',
      );
      expect(asked()).toBe(1);
    });

    it('hides them once the buyer CUI changes, until Denumire is clicked again', async () => {
      const user = userEvent.setup();
      renderApp('/accountants/1/invoices/new', api());
      await screen.findByRole('heading', { name: 'Factură nouă' });
      await user.type(screen.getByLabelText('CUI'), '87654321');
      const description = screen.getByLabelText('Denumire (linia 1)');
      await user.click(description);
      await screen.findByRole('list', { name: SUGGESTION_LIST });

      await user.type(screen.getByLabelText('CUI'), '9');
      await user.click(description);
      expect(screen.queryByRole('list', { name: SUGGESTION_LIST })).not.toBeInTheDocument();
    });
  });
});

describe('Company invoicing cards', () => {
  const route = {
    ...base(),
    'GET /accountants/1/companies/7': { status: 200, body: company() },
  };

  it('saves the IBAN, bank, email and phone', async () => {
    const user = userEvent.setup();
    let body: unknown;
    renderApp('/accountants/1/companies/7', {
      ...route,
      'PATCH /accountants/1/companies/7': (init) => {
        body = JSON.parse(String(init?.body));
        return { status: 200, body: company({ iban: 'RO49AAAA1B31007593840000' }) };
      },
    });
    await screen.findByRole('heading', { name: 'Date pentru facturi' });
    await user.type(screen.getByLabelText('IBAN'), 'ro49 aaaa 1b31 0075 9384 0000');
    await user.type(screen.getByLabelText('Banca'), 'Banca X');
    await user.click(screen.getByRole('button', { name: 'Salvează' }));
    await waitFor(() =>
      expect(body).toEqual({
        iban: 'RO49AAAA1B31007593840000',
        bankName: 'Banca X',
        email: null,
        phone: null,
      }),
    );
  });

  it('refuses a malformed IBAN', async () => {
    const user = userEvent.setup();
    renderApp('/accountants/1/companies/7', route);
    await screen.findByRole('heading', { name: 'Date pentru facturi' });
    await user.type(screen.getByLabelText('IBAN'), 'RO12');
    expect(screen.getByText('IBAN invalid.')).toBeInTheDocument();
  });

  it('uploads a PNG logo', async () => {
    const user = userEvent.setup();
    let form: FormData | undefined;
    renderApp('/accountants/1/companies/7', {
      ...route,
      'PUT /accountants/1/companies/7/logo': (init) => {
        form = init?.body as FormData;
        return { status: 200, body: company({ hasLogo: true }) };
      },
    });
    await screen.findByRole('heading', { name: 'Logo' });
    const file = new File([new Uint8Array([1, 2, 3])], 'logo.png', {
      type: 'image/png',
    });
    await user.upload(screen.getByLabelText('Fișier logo'), file);
    await waitFor(() => expect(form?.get('logo')).toBeInstanceOf(File));
    expect(form?.get('logo')).toMatchObject({ name: 'logo.png' });
  });

  it('refuses a logo that is not PNG or JPEG without uploading', async () => {
    const user = userEvent.setup({ applyAccept: false });
    const { calls } = renderApp('/accountants/1/companies/7', route);
    await screen.findByRole('heading', { name: 'Logo' });
    const file = new File(['<svg/>'], 'logo.svg', { type: 'image/svg+xml' });
    await user.upload(screen.getByLabelText('Fișier logo'), file);
    expect(
      await screen.findByText('Logo-ul trebuie să fie PNG sau JPEG.'),
    ).toBeInTheDocument();
    expect(calls.some((c) => c.startsWith('PUT'))).toBe(false);
  });

  it('refuses a logo over 512 KB without uploading', async () => {
    const user = userEvent.setup();
    const { calls } = renderApp('/accountants/1/companies/7', route);
    await screen.findByRole('heading', { name: 'Logo' });
    const file = new File([new Uint8Array(512 * 1024 + 1)], 'big.png', {
      type: 'image/png',
    });
    await user.upload(screen.getByLabelText('Fișier logo'), file);
    expect(
      await screen.findByText('Logo-ul poate avea cel mult 512 KB.'),
    ).toBeInTheDocument();
    expect(calls.some((c) => c.startsWith('PUT'))).toBe(false);
  });

  it('shows the current logo and lets you remove it', async () => {
    const user = userEvent.setup();
    const { calls } = renderApp('/accountants/1/companies/7', {
      ...base(),
      'GET /accountants/1/companies/7': {
        status: 200,
        body: company({ hasLogo: true }),
      },
      'DELETE /accountants/1/companies/7/logo': {
        status: 200,
        body: company({ hasLogo: false }),
      },
    });
    const img = await screen.findByAltText('Logo Agro Vest SRL');
    expect(img.getAttribute('src')).toContain(
      '/accountants/1/companies/7/logo',
    );
    await user.click(screen.getByRole('button', { name: 'Șterge logo-ul' }));
    await user.click(
      screen.getByRole('button', { name: 'Confirmă ștergerea' }),
    );
    await waitFor(() =>
      expect(calls).toContain('DELETE /accountants/1/companies/7/logo'),
    );
  });
});
