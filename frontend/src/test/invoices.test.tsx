import { screen, waitFor } from '@testing-library/react';
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
        name: /Salvează în Storage FCT 000012/,
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
      screen.getByRole('button', { name: 'Salvează în Storage' }),
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
    await user.click(screen.getByLabelText('Salvează PDF-ul în Supabase Storage'));
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

  it('rejects an invalid CUI without calling ANAF', async () => {
    const user = userEvent.setup();
    const { calls } = renderApp('/accountants/1/invoices/new', base());
    await screen.findByRole('heading', { name: 'Factură nouă' });
    await user.type(screen.getByLabelText('CUI'), '12');
    await user.clear(screen.getByLabelText('CUI'));
    await user.type(screen.getByLabelText('CUI'), 'abc');
    await user.click(screen.getByRole('button', { name: 'Caută la ANAF' }));
    expect(await screen.findByText(/CUI invalid/)).toBeInTheDocument();
    expect(calls.some((c) => c.includes('buyer-lookup'))).toBe(false);
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
