import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ME, renderApp } from './render';

afterEach(() => vi.unstubAllGlobals());

const COMPANY = { id: 7, name: 'Agro Vest SRL', cui: '12345678' };

const UPLOAD = {
  id: 5,
  accountantId: 1,
  companyId: 7,
  invoiceId: 3,
  anafConnectionId: 'c',
  environment: 'test',
  standard: 'UBL',
  uploadIndex: '3828',
  status: 'processing',
  downloadId: null,
  errorMessage: null,
  checkedAt: null,
  createdAt: '2026-10-05T08:00:00Z',
};

const page = (items: unknown[]) => ({
  status: 200,
  body: { items, total: items.length, page: 1, pageSize: 25 },
});

async function pickCompany(
  user: ReturnType<typeof userEvent.setup>,
  label: string,
) {
  await screen.findAllByRole('option', { name: 'Agro Vest SRL' });
  await user.selectOptions(screen.getByLabelText(label), '7');
}

const base = {
  'GET /auth/me': { status: 200, body: ME },
  'GET /accountants/1/companies': { status: 200, body: [COMPANY] },
  'GET /accountants/1/anaf/connections': { status: 200, body: [] },
};

describe('e-Factura: încărcări', () => {
  it('lists the uploads and refreshes one that is still processing', async () => {
    const user = userEvent.setup();
    const { calls } = renderApp('/accountants/1/efactura', {
      ...base,
      'GET /accountants/1/efactura/uploads?page=1&pageSize=25': page([UPLOAD]),
      'POST /accountants/1/efactura/uploads/5/refresh': {
        status: 200,
        body: { ...UPLOAD, status: 'ok', downloadId: '9001' },
      },
    });
    expect(await screen.findByText('3828')).toBeInTheDocument();
    expect(screen.getByText('În prelucrare')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Verifică starea 3828' }));
    await waitFor(() =>
      expect(calls).toContain('POST /accountants/1/efactura/uploads/5/refresh'),
    );
  });

  it('offers the ANAF answer for a file that has a download id and no refresh', async () => {
    renderApp('/accountants/1/efactura', {
      ...base,
      'GET /accountants/1/efactura/uploads?page=1&pageSize=25': page([
        { ...UPLOAD, status: 'nok', downloadId: '9001' },
      ]),
    });
    expect(
      await screen.findByRole('button', { name: 'Descarcă răspunsul 3828' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Respinsă')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Verifică starea 3828' }),
    ).not.toBeInTheDocument();
  });

  it('shows what ANAF refused', async () => {
    renderApp('/accountants/1/efactura', {
      ...base,
      'GET /accountants/1/efactura/uploads?page=1&pageSize=25': page([
        {
          ...UPLOAD,
          status: 'rejected',
          uploadIndex: null,
          errorMessage: 'Marime fisier transmis mai mare de 10 MB.',
        },
      ]),
    });
    expect(await screen.findByText('Refuzat de ANAF')).toBeInTheDocument();
    expect(
      screen.getByText('Marime fisier transmis mai mare de 10 MB.'),
    ).toBeInTheDocument();
  });

  it('uploads an XML file with the chosen company and type', async () => {
    const user = userEvent.setup();
    let body: FormData | null = null;
    renderApp('/accountants/1/efactura', {
      ...base,
      'GET /accountants/1/efactura/uploads?page=1&pageSize=25': page([]),
      'POST /accountants/1/efactura/uploads': (init) => {
        body = init?.body as FormData;
        return { status: 201, body: UPLOAD };
      },
    });
    await pickCompany(user, 'Firma (furnizorul)');
    await user.selectOptions(screen.getByLabelText('Tip fișier'), 'CN');
    await user.upload(
      screen.getByLabelText(/Fișier XML/),
      new File(['<CreditNote/>'], 'cn.xml', { type: 'text/xml' }),
    );
    await user.click(screen.getByLabelText(/Cumpărătorul nu este din România/));
    await user.click(screen.getByRole('button', { name: 'Trimite la ANAF' }));
    expect(
      await screen.findByText('Fișierul a fost trimis. Index ANAF: 3828.'),
    ).toBeInTheDocument();
    const sent = body as unknown as FormData;
    expect(sent.get('companyId')).toBe('7');
    expect(sent.get('standard')).toBe('CN');
    expect(sent.get('extern')).toBe('true');
    expect((sent.get('file') as File).name).toBe('cn.xml');
  });

  it('asks for a company and a file before posting', async () => {
    const user = userEvent.setup();
    const { calls } = renderApp('/accountants/1/efactura', {
      ...base,
      'GET /accountants/1/efactura/uploads?page=1&pageSize=25': page([]),
    });
    await user.click(
      await screen.findByRole('button', { name: 'Trimite la ANAF' }),
    );
    expect(
      screen.getByText('Alegeți firma pentru care se trimite fișierul.'),
    ).toBeInTheDocument();
    await pickCompany(user, 'Firma (furnizorul)');
    await user.click(screen.getByRole('button', { name: 'Trimite la ANAF' }));
    expect(screen.getByText('Alegeți un fișier XML.')).toBeInTheDocument();
    expect(calls.some((c) => c.startsWith('POST'))).toBe(false);
  });

  it('shows ANAF’s refusal of an uploaded file', async () => {
    const user = userEvent.setup();
    renderApp('/accountants/1/efactura', {
      ...base,
      'GET /accountants/1/efactura/uploads?page=1&pageSize=25': page([]),
      'POST /accountants/1/efactura/uploads': {
        status: 201,
        body: {
          ...UPLOAD,
          status: 'rejected',
          uploadIndex: null,
          errorMessage: 'Fișier invalid',
        },
      },
    });
    await pickCompany(user, 'Firma (furnizorul)');
    await user.upload(
      screen.getByLabelText(/Fișier XML/),
      new File(['x'], 'a.xml'),
    );
    await user.click(screen.getByRole('button', { name: 'Trimite la ANAF' }));
    expect(await screen.findByText('ANAF a refuzat fișierul.')).toBeInTheDocument();
    expect(screen.getByText('Fișier invalid')).toBeInTheDocument();
  });
});

describe('e-Factura: mesaje ANAF', () => {
  const MESSAGES = {
    title: 'Lista',
    messages: [
      {
        id: '3001474425',
        requestId: '5001120362',
        type: 'ERORI FACTURA',
        details: 'Erori de validare identificate',
        cif: '12345678',
        createdAt: '2022-10-31T12:52:00.000Z',
        createdAtRaw: '202210311452',
      },
    ],
    total: null,
    page: null,
    pages: null,
  };

  it('waits for a company, then lists its messages with the filter', async () => {
    const user = userEvent.setup();
    const { calls } = renderApp('/accountants/1/efactura/messages', {
      ...base,
      'GET /accountants/1/efactura/companies/7/messages?zile=30&filtru=E': {
        status: 200,
        body: MESSAGES,
      },
    });
    expect(await screen.findByText('Alegeți o firmă.')).toBeInTheDocument();
    await pickCompany(user, 'Firma');
    await user.selectOptions(screen.getByLabelText('Tip mesaje'), 'E');
    expect(
      await screen.findByText('Erori de validare identificate'),
    ).toBeInTheDocument();
    expect(screen.getByText('ERORI FACTURA')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Descarcă mesajul 3001474425' }),
    ).toBeInTheDocument();
    expect(
      calls.includes('GET /accountants/1/efactura/companies/7/messages?zile=30'),
    ).toBe(true);
  });

  it('shows the error ANAF gives', async () => {
    const user = userEvent.setup();
    renderApp('/accountants/1/efactura/messages', {
      ...base,
      'GET /accountants/1/efactura/companies/7/messages?zile=30': {
        status: 400,
        body: { message: 'Firma nu are un certificat ANAF asociat.' },
      },
    });
    await pickCompany(user, 'Firma');
    expect(
      await screen.findByText(/Firma nu are un certificat ANAF asociat/),
    ).toBeInTheDocument();
  });

  it('does not query for days outside 1..60', async () => {
    const user = userEvent.setup();
    const { calls } = renderApp('/accountants/1/efactura/messages', base);
    await pickCompany(user, 'Firma');
    const days = screen.getByLabelText('Ultimele zile (1–60)');
    await user.clear(days);
    await user.type(days, '61');
    expect(
      await screen.findByText('Introduceți un număr între 1 și 60'),
    ).toBeInTheDocument();
    expect(calls.filter((c) => c.includes('zile=61'))).toEqual([]);
  });
});

describe('e-Factura: validator', () => {
  it('validates a file against the chosen standard', async () => {
    const user = userEvent.setup();
    let body: FormData | null = null;
    renderApp('/accountants/1/efactura/validator', {
      ...base,
      'POST /accountants/1/efactura/validate': (init) => {
        body = init?.body as FormData;
        return { status: 200, body: { valid: true, messages: [], traceId: 't-1' } };
      },
    });
    await user.selectOptions(await screen.findByLabelText('Tip document'), 'FCN');
    await user.upload(
      screen.getByLabelText(/fișier XML/i),
      new File(['<a/>'], 'a.xml'),
    );
    await user.click(screen.getByRole('button', { name: 'Validează' }));
    expect(await screen.findByText('XML-ul este valid.')).toBeInTheDocument();
    expect(screen.getByText(/t-1/)).toBeInTheDocument();
    expect((body as unknown as FormData).get('standard')).toBe('FCN');
  });

  it('validates an invoice picked from SPVDirect, newest first', async () => {
    const user = userEvent.setup();
    renderApp('/accountants/1/efactura/validator', {
      ...base,
      'GET /accountants/1/invoices?page=1&pageSize=25&companyId=7': {
        status: 200,
        body: { items: [INVOICE], total: 1, page: 1, pageSize: 25 },
      },
      'POST /accountants/1/efactura/invoices/3/validate': {
        status: 200,
        body: { valid: true, messages: [], traceId: 't-9' },
      },
    });
    await screen.findAllByRole('option', { name: 'Agro Vest SRL' });
    expect(screen.getByLabelText('Factură emisă în SPVDirect')).toBeDisabled();
    await user.selectOptions(screen.getByLabelText('Firma'), '7');
    await screen.findByRole('option', { name: /FCT 000012/ });
    await user.selectOptions(screen.getByLabelText('Factură emisă în SPVDirect'), '3');
    expect(screen.getByLabelText(/fișier XML/i)).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Validează' }));
    expect(await screen.findByText('XML-ul este valid.')).toBeInTheDocument();
    expect(screen.getByText(/t-9/)).toBeInTheDocument();
  });

  it('lists why the XML is not valid', async () => {
    const user = userEvent.setup();
    renderApp('/accountants/1/efactura/validator', {
      ...base,
      'POST /accountants/1/efactura/validate': {
        status: 200,
        body: {
          valid: false,
          messages: ['E: BR-RO-110 …', 'E: BR-CO-09 …'],
          traceId: null,
        },
      },
    });
    await user.upload(
      await screen.findByLabelText(/fișier XML/i),
      new File(['<a/>'], 'a.xml'),
    );
    await user.click(screen.getByRole('button', { name: 'Validează' }));
    expect(await screen.findByText('XML-ul nu este valid.')).toBeInTheDocument();
    const log = screen.getByText(/E: BR-RO-110/);
    expect(log.tagName).toBe('PRE');
    expect(log).toHaveTextContent('E: BR-RO-110 … E: BR-CO-09 …');
    expect(log.closest('.spv-alert')).not.toBeNull();
  });

  it('asks for an invoice or a file first', async () => {
    const user = userEvent.setup();
    const { calls } = renderApp('/accountants/1/efactura/validator', base);
    await user.click(await screen.findByRole('button', { name: 'Validează' }));
    expect(screen.getByText('Alegeți o factură din SPVDirect sau un fișier XML.')).toBeInTheDocument();
    expect(calls.some((c) => c.startsWith('POST'))).toBe(false);
  });

  it('shows why a PDF cannot be made from an invalid XML', async () => {
    const user = userEvent.setup();
    renderApp('/accountants/1/efactura/validator', {
      ...base,
      'POST /accountants/1/efactura/transform': {
        status: 400,
        body: {
          message: 'XML-ul nu trece validarea ANAF, deci nu poate fi transformat',
          errors: ['E: BR-01'],
        },
      },
    });
    await user.upload(
      await screen.findByLabelText(/fișier XML/i),
      new File(['<a/>'], 'a.xml'),
    );
    await user.click(screen.getByRole('button', { name: 'Convertește în PDF' }));
    expect(
      await screen.findByText('PDF-ul nu a putut fi generat.'),
    ).toBeInTheDocument();
    expect(await screen.findByText('E: BR-01')).toBeInTheDocument();
  });
});

const INVOICE = {
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

const invoiceRoutes = (upload: unknown | null) => ({
  ...base,
  'GET /accountants/1/invoices?page=1&pageSize=25': {
    status: 200,
    body: { items: [INVOICE], total: 1, page: 1, pageSize: 25 },
  },
  'GET /accountants/1/efactura/invoices/latest-uploads?ids=3': {
    status: 200,
    body: upload ? [upload] : [],
  },
});

describe('e-Factura din lista de facturi', () => {
  it('sends the invoice to ANAF and tells the index', async () => {
    const user = userEvent.setup();
    renderApp('/accountants/1/invoices', {
      ...invoiceRoutes(null),
      'POST /accountants/1/efactura/invoices/3/upload': {
        status: 201,
        body: UPLOAD,
      },
    });
    await user.click(
      await screen.findByRole('button', { name: 'Trimite la ANAF FCT 000012' }),
    );
    expect(
      await screen.findByText('Factura a fost trimisă la ANAF. Index: 3828.'),
    ).toBeInTheDocument();
  });

  it('lists the validation errors when ANAF’s validator refuses the invoice', async () => {
    const user = userEvent.setup();
    renderApp('/accountants/1/invoices', {
      ...invoiceRoutes(null),
      'POST /accountants/1/efactura/invoices/3/upload': {
        status: 400,
        body: {
          message: 'XML-ul facturii nu trece validarea ANAF',
          errors: ['BR-CO-09 …'],
        },
      },
    });
    await user.click(
      await screen.findByRole('button', { name: 'Trimite la ANAF FCT 000012' }),
    );
    expect(
      await screen.findByText('Factura nu a fost trimisă la ANAF.'),
    ).toBeInTheDocument();
    expect(screen.getByText('BR-CO-09 …')).toBeInTheDocument();
  });

  it('shows the state and hides the button for an accepted invoice', async () => {
    renderApp(
      '/accountants/1/invoices',
      invoiceRoutes({ ...UPLOAD, status: 'ok', downloadId: '9001' }),
    );
    expect(await screen.findByText('Acceptată')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Trimite la ANAF FCT 000012' }),
    ).not.toBeInTheDocument();
  });

  it('lets a refused invoice be sent again', async () => {
    renderApp(
      '/accountants/1/invoices',
      invoiceRoutes({ ...UPLOAD, status: 'nok', downloadId: '9001' }),
    );
    expect(await screen.findByText('Respinsă')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Trimite la ANAF FCT 000012' }),
    ).toBeInTheDocument();
  });

  it('validates the invoice XML on demand', async () => {
    const user = userEvent.setup();
    renderApp('/accountants/1/invoices', {
      ...invoiceRoutes(null),
      'POST /accountants/1/efactura/invoices/3/validate': {
        status: 200,
        body: { valid: false, messages: ['E: BR-RO-110'], traceId: null },
      },
    });
    await user.click(
      await screen.findByRole('button', { name: 'Validează XML FCT 000012' }),
    );
    expect(
      await screen.findByText('XML-ul facturii nu trece validarea ANAF.'),
    ).toBeInTheDocument();
    const log = screen.getByText('E: BR-RO-110');
    const note = log.closest('tr');
    expect(note).toHaveClass('spv-row-note');
    expect(note?.previousElementSibling).toHaveTextContent('FCT 000012');
  });
});
