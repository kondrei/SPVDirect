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
  roles: ['EFACTURA'],
  source: 'self',
  accessExpiresAt: future(80),
  refreshExpiresAt: future(12),
  lastRefreshedAt: null,
  status: 'active',
  createdAt: future(-1),
  updatedAt: future(-1),
};

const ANAF = {
  date_generale: {
    data: '2026-09-25',
    cui: 14399840,
    denumire: 'AGRO VEST SRL',
    adresa: 'JUD. TIMIŞ, MUN. TIMIŞOARA, STR. EXEMPLU, NR.1',
    telefon: '0256000000',
    fax: '',
    codPostal: '300001',
    act: '',
    stare_inregistrare: 'INREGISTRAT din data 01.02.2010',
    data_inreg_Reg_RO_e_Factura: '2022-07-01',
    organFiscalCompetent: 'AJFP Timiş',
    forma_de_proprietate: 'PROPR.PRIVATA',
    forma_organizare: 'PERSOANA JURIDICA',
    forma_juridica: 'SOCIETATE COMERCIALĂ CU RĂSPUNDERE LIMITATĂ',
    statusRO_e_Factura: true,
    data_inregistrare: '2010-02-01',
    nrRegCom: 'J35/100/2010',
    cod_CAEN: '0111',
    iban: '',
  },
  inregistrare_scop_Tva: {
    scpTVA: true,
    perioade_TVA: [
      {
        data_inceput_ScpTVA: '2010-03-01',
        data_sfarsit_ScpTVA: '',
        data_anul_imp_ScpTVA: '',
        mesaj_ScpTVA: '',
      },
    ],
  },
  inregistrare_RTVAI: {
    dataInceputTvaInc: '',
    dataSfarsitTvaInc: '',
    dataActualizareTvaInc: '',
    dataPublicareTvaInc: '',
    tipActTvaInc: '',
    statusTvaIncasare: false,
  },
  stare_inactiv: {
    dataInactivare: '',
    dataReactivare: '',
    dataPublicare: '',
    dataRadiere: '',
    statusInactivi: false,
  },
  inregistrare_SplitTVA: {
    dataInceputSplitTVA: '',
    dataAnulareSplitTVA: '',
    statusSplitTVA: false,
  },
  adresa_sediu_social: {
    sdenumire_Strada: 'Str. Exemplu',
    snumar_Strada: '1',
    sdenumire_Localitate: 'Mun. Timişoara',
    sdenumire_Judet: 'TIMIŞ',
    scod_Postal: '300001',
  },
  adresa_domiciliu_fiscal: {
    ddenumire_Strada: 'Str. Exemplu',
    dnumar_Strada: '1',
    ddenumire_Localitate: 'Mun. Timişoara',
    ddenumire_Judet: 'TIMIŞ',
    dcod_Postal: '300001',
  },
};

const company = (over: Record<string, unknown> = {}) => ({
  id: 1,
  accountantId: 1,
  cui: '14399840',
  name: 'Agro Vest SRL',
  anafConnectionId: null,
  regCom: 'J35/100/2010',
  address: ANAF.date_generale.adresa,
  caenCode: '0111',
  registrationStatus: ANAF.date_generale.stare_inregistrare,
  vatPayer: true,
  vatOnCollection: false,
  splitVat: false,
  eFactura: true,
  inactive: false,
  anafData: ANAF,
  anafSyncedAt: future(-1),
  createdAt: future(-1),
  updatedAt: future(-1),
  ...over,
});

describe('session', () => {
  it('sends signed-out users to /login and keeps where they were going', async () => {
    const { router } = renderApp('/companies', {
      'GET /auth/me': { status: 401, body: { message: 'Unauthorized' } },
    });
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
    expect(router.state.location.search).toBe('?next=%2Fcompanies');
    expect(
      await screen.findByRole('heading', { name: 'Autentificare' }),
    ).toBeInTheDocument();
  });

  it('logs in and returns to the requested page', async () => {
    const user = userEvent.setup();
    let body = '';
    const { router } = renderApp('/login?next=%2Fcompanies', {
      'GET /auth/me': { status: 401 },
      'POST /auth/login': (init) => {
        body = String(init?.body);
        return { status: 200, body: ME };
      },
      'GET /accountants/1/companies': { status: 200, body: [] },
      'GET /accountants/1/anaf/connections': { status: 200, body: [] },
    });
    await user.type(await screen.findByLabelText('Email'), 'andrei@cabinet.ro');
    await user.type(screen.getByLabelText('Parolă'), 'a-long-password');
    await user.click(screen.getByRole('button', { name: 'Intră în cont' }));
    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/accountants/1/companies'),
    );
    expect(JSON.parse(body)).toEqual({
      email: 'andrei@cabinet.ro',
      password: 'a-long-password',
    });
  });

  it('moves URLs without an accountant under the signed-in accountant', async () => {
    const { router } = renderApp('/companies?add=1', {
      'GET /auth/me': { status: 200, body: ME },
      'GET /accountants/1/companies': { status: 200, body: [] },
      'GET /accountants/1/anaf/connections': { status: 200, body: [] },
    });
    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/accountants/1/companies'),
    );
    expect(router.state.location.search).toBe('?add=1');
  });

  it('opens the dashboard of the signed-in accountant from /', async () => {
    const { router } = renderApp('/', {
      'GET /auth/me': { status: 200, body: ME },
      'GET /accountants/1/companies': { status: 200, body: [] },
      'GET /accountants/1/anaf/connections': { status: 200, body: [] },
    });
    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/accountants/1'),
    );
  });

  it('does not show another accountant’s pages', async () => {
    const { calls } = renderApp('/accountants/2/companies', {
      'GET /auth/me': { status: 200, body: ME },
      'GET /accountants/1/companies': { status: 200, body: [] },
      'GET /accountants/1/anaf/connections': { status: 200, body: [] },
    });
    expect(
      await screen.findByText('Nu aveți acces la acest cont.'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Mergi la contul dvs.' }),
    ).toHaveAttribute('href', '/accountants/1');
    expect(calls.some((c) => c.includes('/accountants/2'))).toBe(false);
  });

  it('shows the backend message when login fails', async () => {
    const user = userEvent.setup();
    renderApp('/login', {
      'GET /auth/me': { status: 401 },
      'POST /auth/login': {
        status: 401,
        body: { message: 'Email sau parolă greșită' },
      },
    });
    await user.type(await screen.findByLabelText('Email'), 'x@y.ro');
    await user.type(screen.getByLabelText('Parolă'), 'wrong-password');
    await user.click(screen.getByRole('button', { name: 'Intră în cont' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Email sau parolă greșită',
    );
  });
});

describe('companies', () => {
  it('validates the CUI before calling the API, posts only the CUI, then opens the new company', async () => {
    const user = userEvent.setup();
    let posted: unknown;
    const { calls, router } = renderApp('/companies?add=1', {
      'GET /auth/me': { status: 200, body: ME },
      'GET /accountants/1/companies': { status: 200, body: [] },
      'GET /accountants/1/anaf/connections': { status: 200, body: [] },
      'POST /accountants/1/companies': (init) => {
        posted = JSON.parse(String(init?.body));
        return { status: 201, body: company() };
      },
    });
    expect(screen.queryByLabelText('Denumire')).not.toBeInTheDocument();
    const cui = await screen.findByLabelText('CUI');
    await user.type(cui, 'RO12A');
    await user.click(screen.getByRole('button', { name: 'Adaugă' }));
    expect(await screen.findByText(/CUI invalid/)).toBeInTheDocument();
    expect(calls).not.toContain('POST /accountants/1/companies');

    await user.clear(cui);
    await user.type(cui, 'RO 14399840');
    await user.click(screen.getByRole('button', { name: 'Adaugă' }));
    await waitFor(() => expect(posted).toEqual({ cui: '14399840' }));
    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/accountants/1/companies/1'),
    );
  });

  it('shows the backend message when ANAF does not know the CUI', async () => {
    const user = userEvent.setup();
    renderApp('/companies?add=1', {
      'GET /auth/me': { status: 200, body: ME },
      'GET /accountants/1/companies': { status: 200, body: [] },
      'GET /accountants/1/anaf/connections': { status: 200, body: [] },
      'POST /accountants/1/companies': {
        status: 400,
        body: {
          statusCode: 400,
          message:
            'CUI incorect: nu există nicio firmă cu acest CUI în baza de date ANAF.',
        },
      },
    });
    await user.type(await screen.findByLabelText('CUI'), '99999999');
    await user.click(screen.getByRole('button', { name: 'Adaugă' }));
    expect(await screen.findByText(/CUI incorect/)).toBeInTheDocument();
  });

  it('lists companies with their certificate and VAT status', async () => {
    renderApp('/companies', {
      'GET /auth/me': { status: 200, body: ME },
      'GET /accountants/1/companies': {
        status: 200,
        body: [
          company({ anafConnectionId: 'c1' }),
          company({
            id: 2,
            cui: '40211987',
            name: 'Brutăria Ionescu SRL',
            vatPayer: false,
            inactive: true,
          }),
        ],
      },
      'GET /accountants/1/anaf/connections': { status: 200, body: [CONN] },
    });
    expect(
      await screen.findByRole('link', { name: 'Agro Vest SRL' }),
    ).toHaveAttribute('href', '/accountants/1/companies/1');
    expect(screen.getByText('RO 14399840')).toBeInTheDocument();
    expect(screen.getByText('Expiră curând')).toBeInTheDocument();
    expect(screen.getByText('Fără certificat')).toBeInTheDocument();
    expect(screen.getByText('Da')).toBeInTheDocument();
    expect(screen.getByText('Nu')).toBeInTheDocument();
    expect(screen.getByText('Contribuabil inactiv')).toBeInTheDocument();
  });

  it('shows every ANAF section on the company page', async () => {
    renderApp('/companies/1', {
      'GET /auth/me': { status: 200, body: ME },
      'GET /accountants/1/companies/1': { status: 200, body: company() },
      'GET /accountants/1/anaf/connections': { status: 200, body: [] },
    });
    expect(
      await screen.findByRole('heading', { name: 'Date ANAF' }),
    ).toBeInTheDocument();
    for (const h of [
      'Date generale',
      'RO e-Factura',
      'Înregistrare în scopuri de TVA',
      'TVA la încasare',
      'Contribuabil inactiv / reactivat',
      'Plata defalcată a TVA',
      'Adresa sediului social',
      'Adresa domiciliului fiscal',
    ]) {
      expect(screen.getByRole('heading', { name: h })).toBeInTheDocument();
    }
    expect(screen.getByText('J35/100/2010')).toBeInTheDocument();
    expect(
      screen.getByText('SOCIETATE COMERCIALĂ CU RĂSPUNDERE LIMITATĂ'),
    ).toBeInTheDocument();
    expect(screen.getByText('01.03.2010')).toBeInTheDocument();
  });

  it('shows not found for a non-numeric company id without calling the API', async () => {
    const { calls } = renderApp('/companies/abc', {
      'GET /auth/me': { status: 200, body: ME },
      'GET /accountants/1/anaf/connections': { status: 200, body: [] },
    });
    expect(
      await screen.findByText('Firma nu a fost găsită.'),
    ).toBeInTheDocument();
    expect(calls.filter((c) => c.includes('/companies/'))).toEqual([]);
  });

  it('offers to fetch ANAF data for a company added before the lookup existed', async () => {
    const user = userEvent.setup();
    let refreshed = false;
    renderApp('/companies/1', {
      'GET /auth/me': { status: 200, body: ME },
      'GET /accountants/1/companies/1': {
        status: 200,
        body: company({ anafData: null, anafSyncedAt: null, vatPayer: null }),
      },
      'GET /accountants/1/anaf/connections': { status: 200, body: [] },
      'POST /accountants/1/companies/1/anaf-refresh': () => {
        refreshed = true;
        return { status: 200, body: company() };
      },
    });
    expect(
      await screen.findByText(/nu au fost încă preluate/),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Preia datele' }));
    expect(
      await screen.findByRole('heading', { name: 'Date generale' }),
    ).toBeInTheDocument();
    expect(refreshed).toBe(true);
  });
});

describe('connections', () => {
  it('shows the OAuth callback error as plain text', async () => {
    renderApp(
      '/connections?status=error&message=%3Cimg%20src%3Dx%20onerror%3Dalert(1)%3E',
      {
        'GET /auth/me': { status: 200, body: ME },
        'GET /accountants/1/companies': { status: 200, body: [] },
        'GET /accountants/1/anaf/connections': { status: 200, body: [] },
      },
    );
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('<img src=x onerror=alert(1)>');
    expect(alert.querySelector('img')).toBeNull();
  });

  it('links "Conectează certificat" to the backend OAuth start as a full navigation', async () => {
    renderApp('/connections', {
      'GET /auth/me': { status: 200, body: ME },
      'GET /accountants/1/companies': { status: 200, body: [] },
      'GET /accountants/1/anaf/connections': { status: 200, body: [CONN] },
    });
    const links = await screen.findAllByRole('link', {
      name: /Conectează certificat/,
    });
    expect(links[0]).toHaveAttribute('href', '/api/accountants/1/anaf/connect');
    expect(await screen.findByText('Expiră în 12 zile')).toBeInTheDocument();
  });
});
