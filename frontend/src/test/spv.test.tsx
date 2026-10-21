import { screen, waitFor, within } from '@testing-library/react';
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

  it('does not offer an ANAF sync', async () => {
    const { calls } = renderApp('/accountants/1/spv', base);
    expect(await screen.findByText('Recipisa D300')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Sincronizează din ANAF' }),
    ).not.toBeInTheDocument();
    expect(calls.some((c) => c.includes('/spv/sync'))).toBe(false);
  });

  it('links to the ANAF list for the chosen number of days', async () => {
    renderApp('/accountants/1/spv', base);
    const user = userEvent.setup();
    const link = await screen.findByRole('link', {
      name: 'Deschide lista la ANAF',
    });
    expect(link).toHaveAttribute(
      'href',
      'https://webserviced.anaf.ro/SPVWS2/rest/listaMesaje?zile=60',
    );
    expect(link).toHaveAttribute('target', '_blank');
    const days = screen.getByLabelText(/Ultimele zile/);
    await user.clear(days);
    await user.type(days, '15');
    expect(link).toHaveAttribute(
      'href',
      'https://webserviced.anaf.ro/SPVWS2/rest/listaMesaje?zile=15',
    );
  });

  it('imports the list pasted from ANAF and reports what was new', async () => {
    let sent: Promise<string> | undefined;
    const { calls } = renderApp('/accountants/1/spv', {
      ...base,
      'POST /accountants/1/spv/archive/import': (init) => {
        sent = ((init!.body as FormData).get('file') as Blob).text();
        return {
          status: 200,
          body: {
            fetched: 2,
            added: 1,
            title: 'Lista',
            certSerial: '4C000012A9F3',
            notice: null,
            rights: 3,
            unknownCuis: ['38745062', '14399840'],
          },
        };
      },
    });
    const user = userEvent.setup();
    const pasted = '{"titlu":"Lista","mesaje":[{"id":"929663619"}]}';
    await user.click(
      await screen.findByLabelText('Lista de mesaje de la ANAF'),
    );
    await user.paste(pasted);
    await user.click(screen.getByRole('button', { name: 'Importă mesajele' }));

    expect(
      await screen.findByText(/2 mesaje în listă, 1 noi, 1 existau deja/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/drepturi SPV pentru 3 CUI\/CNP-uri/),
    ).toBeInTheDocument();
    expect(
      screen.getByText('2 firme din certificat nu sunt în lista dvs. de firme.'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Adaugă în Firme' }),
    ).toHaveAttribute(
      'href',
      '/accountants/1/companies?add=1&cuis=38745062,14399840',
    );
    expect(await sent).toBe(pasted);
    await waitFor(() =>
      expect(
        calls.filter((c) => c.includes('/spv/archive?')).length,
      ).toBeGreaterThan(1),
    );
  });

  it('shows the ANAF reason when the list has no messages', async () => {
    renderApp('/accountants/1/spv', {
      ...base,
      'POST /accountants/1/spv/archive/import': {
        status: 200,
        body: {
          fetched: 0,
          added: 0,
          title: 'Lista Mesaje',
          certSerial: null,
          notice: 'Nu exista mesaje in ultimele 5 zile',
          rights: 0,
          unknownCuis: [],
        },
      },
    });
    const user = userEvent.setup();
    await user.click(
      await screen.findByLabelText('Lista de mesaje de la ANAF'),
    );
    await user.paste('{"eroare":"Nu exista mesaje in ultimele 5 zile"}');
    await user.click(screen.getByRole('button', { name: 'Importă mesajele' }));
    expect(
      await screen.findByText('ANAF: Nu exista mesaje in ultimele 5 zile.'),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'Adaugă în Firme' }),
    ).not.toBeInTheDocument();
  });

  it('asks for the list before importing and shows ANAF errors', async () => {
    const { calls } = renderApp('/accountants/1/spv', {
      ...base,
      'POST /accountants/1/spv/archive/import': {
        status: 400,
        body: {
          message:
            'Textul nu este JSON-ul primit de la ANAF. Copiați toată pagina deschisă la ANAF.',
        },
      },
    });
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole('button', { name: 'Importă mesajele' }),
    );
    expect(
      await screen.findByText(/Lipiți textul copiat de la ANAF/),
    ).toBeInTheDocument();
    expect(calls.some((c) => c.startsWith('POST'))).toBe(false);

    await user.type(screen.getByLabelText('Lista de mesaje de la ANAF'), 'x');
    await user.click(screen.getByRole('button', { name: 'Importă mesajele' }));
    expect(
      await screen.findByText(/nu este JSON-ul primit de la ANAF/),
    ).toBeInTheDocument();
  });

  it('opens an unsaved document at ANAF and saves the PDF uploaded back', async () => {
    let uploaded: unknown;
    renderApp('/accountants/1/spv', {
      ...base,
      'PUT /accountants/1/spv/archive/6/document': (init) => {
        uploaded = (init!.body as FormData).get('document');
        return { status: 200, body: { ...ARCHIVE.items[1], stored: true } };
      },
    });
    const user = userEvent.setup();
    const link = await screen.findByRole('link', {
      name: 'Deschide la ANAF mesajul 100000001',
    });
    expect(link).toHaveAttribute(
      'href',
      'https://webserviced.anaf.ro/SPVWS2/rest/descarcare?id=100000001',
    );
    expect(
      screen.queryByRole('link', { name: 'Deschide la ANAF mesajul 100000000' }),
    ).not.toBeInTheDocument();

    const pdf = new File(['%PDF-1.4'], 'mesaj.pdf', {
      type: 'application/pdf',
    });
    await user.upload(
      screen.getByLabelText('PDF pentru mesajul 100000001'),
      pdf,
    );
    await waitFor(() => expect(uploaded).toBeInstanceOf(File));
    expect((uploaded as File).name).toBe('mesaj.pdf');
  });

  it('shows an empty archive', async () => {
    renderApp('/accountants/1/spv', {
      ...base,
      'GET /accountants/1/spv/archive?page=1&pageSize=25': {
        status: 200,
        body: { items: [], total: 0, page: 1, pageSize: 25 },
      },
    });
    expect(await screen.findByText('Niciun mesaj salvat.')).toBeInTheDocument();
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
    await user.selectOptions(await screen.findByLabelText('Tip cerere'), 'D300');
    await user.type(screen.getByLabelText('CUI/CNP'), 'RO 8000000000');
    await user.type(screen.getByLabelText('An'), '2018');
    await user.type(screen.getByLabelText('Luna'), '1');
    await user.click(screen.getByRole('button', { name: 'Trimite cererea' }));

    expect(await screen.findByText('260149')).toBeInTheDocument();
    expect(sent).toEqual({ tip: 'D300', cui: '8000000000', an: 2018, luna: 1 });
  });

  it('lists the ANAF request types with readable names and their exact values', async () => {
    renderApp('/accountants/1/spv', base);
    const select = await screen.findByLabelText('Tip cerere');
    const fisa = screen.getByRole('option', { name: 'Fișa rol' });
    expect(fisa).toHaveValue('Fisa Rol');
    expect(
      screen.getByRole('option', { name: 'D300 – decont de TVA' }),
    ).toHaveValue('D300');
    expect(select).toHaveValue('');
    expect(screen.queryByLabelText('An')).not.toBeInTheDocument();
  });

  it('asks only for what the chosen type needs', async () => {
    let sent: unknown;
    renderApp('/accountants/1/spv', {
      ...base,
      'POST /accountants/1/anaf/connections/c1/spv/requests': (init) => {
        sent = JSON.parse(String(init?.body));
        return { status: 201, body: { requestId: '7' } };
      },
    });
    const user = userEvent.setup();
    const select = await screen.findByLabelText('Tip cerere');

    await user.selectOptions(select, 'Fisa Rol');
    expect(screen.queryByLabelText('An')).not.toBeInTheDocument();
    expect(
      screen.getByLabelText('CUI punct de lucru (opțional)'),
    ).toBeInTheDocument();

    await user.selectOptions(select, 'Adeverinte Venit');
    expect(screen.getByLabelText('An')).toBeInTheDocument();
    expect(screen.queryByLabelText('Luna')).not.toBeInTheDocument();
    await user.type(screen.getByLabelText('CUI/CNP'), '1111111111118');
    await user.type(screen.getByLabelText('An'), '2025');
    await user.click(screen.getByRole('button', { name: 'Trimite cererea' }));
    expect(
      await screen.findByText('Alegeți motivul adeverinței.'),
    ).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Motiv'), 'Altele');
    await user.click(screen.getByRole('button', { name: 'Trimite cererea' }));
    expect(await screen.findByText('7')).toBeInTheDocument();
    expect(sent).toEqual({
      tip: 'Adeverinte Venit',
      cui: '1111111111118',
      an: 2025,
      motiv: 'Altele',
    });
  });

  it('offers only June and December for D208', async () => {
    renderApp('/accountants/1/spv', base);
    const user = userEvent.setup();
    await user.selectOptions(await screen.findByLabelText('Tip cerere'), 'D208');
    const months = within(screen.getByLabelText('Luna'))
      .getAllByRole('option')
      .map((o) => o.getAttribute('value'));
    expect(months).toEqual(['', '6', '12']);
  });

  it('validates the request before sending', async () => {
    const { calls } = renderApp('/accountants/1/spv', base);
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole('button', { name: 'Trimite cererea' }),
    );
    expect(await screen.findByText('Alegeți tipul cererii.')).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Tip cerere'), 'D300');
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
      screen.queryByRole('button', { name: 'Trimite cererea' }),
    ).not.toBeInTheDocument();
  });
});
