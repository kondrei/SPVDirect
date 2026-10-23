import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadRecaptcha } from '../lib/recaptcha';
import { ME, renderApp } from './render';

vi.mock('../lib/recaptcha', () => ({
  loadRecaptcha: vi.fn(() => Promise.resolve()),
  recaptchaToken: vi.fn(() => Promise.resolve('captcha-token')),
}));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.mocked(loadRecaptcha).mockClear();
  localStorage.removeItem('spv-theme');
});

const STATS = {
  accountants: 42,
  companies: 1250,
  invoices: 18400,
  efacturaUploads: 17950,
  spvMessages: 30210,
  anafConnections: 61,
  updatedAt: '2026-10-12T08:30:00Z',
};

describe('landing page', () => {
  it('shows the features and the public counters to signed-out visitors', async () => {
    const { calls } = renderApp('/', {
      'GET /auth/me': { status: 401 },
      'GET /public/stats': { status: 200, body: STATS },
    });
    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'Serviciile ANAF ale tuturor clienților, într-un singur loc.',
      }),
    ).toBeInTheDocument();
    const counters = screen.getByRole('region', { name: 'SPVDirect în cifre' });
    expect(await within(counters).findByText('1.250')).toBeInTheDocument();
    expect(within(counters).getByText('18.400')).toBeInTheDocument();
    expect(within(counters).getByText('Contabili activi')).toBeInTheDocument();
    expect(within(counters).getByText(/Actualizat la/)).toBeInTheDocument();
    const features = screen.getByRole('region', { name: 'Funcționalități' });
    expect(within(features).getByRole('heading', { name: 'RO e-Factura' })).toBeInTheDocument();
    expect(within(features).getByText('În curând')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Autentificare' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Cont nou' })).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByRole('button', { name: 'Panou', description: /Panoul cabinetului/ })).toBeInTheDocument();
    expect(calls).toContain('GET /public/stats');
  });

  it('opens a screenshot full screen and steps through the pages', async () => {
    const user = userEvent.setup();
    localStorage.setItem('spv-theme', 'dark');
    renderApp('/', {
      'GET /auth/me': { status: 401 },
      'GET /public/stats': { status: 200, body: STATS },
    });
    const thumb = screen.getByRole('button', { name: 'Facturi', description: /Facturile emise/ });
    expect(thumb.querySelector('img')).toHaveAttribute('src', '/screenshots/facturi-dark.webp');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await user.click(thumb);

    const viewer = screen.getByRole('dialog', { name: 'Facturi' });
    expect(within(viewer).getByText(/^3 din 6/)).toBeInTheDocument();
    expect(within(viewer).getByRole('img', { name: /pagina Facturi,/ })).toHaveAttribute(
      'src',
      '/screenshots/facturi-dark.webp',
    );

    await user.click(within(viewer).getByRole('button', { name: 'Următoarea' }));
    expect(screen.getByRole('dialog', { name: 'Arhivă e-Factura' })).toBeInTheDocument();

    await user.keyboard('{ArrowLeft}{ArrowLeft}{ArrowLeft}');
    expect(screen.getByRole('dialog', { name: 'Panou' })).toBeInTheDocument();

    await user.keyboard('{ArrowLeft}');
    expect(screen.getByRole('dialog', { name: 'Certificate ANAF' })).toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('closes the screenshot viewer with its button', async () => {
    const user = userEvent.setup();
    renderApp('/', {
      'GET /auth/me': { status: 401 },
      'GET /public/stats': { status: 200, body: STATS },
    });
    await user.click(screen.getByRole('button', { name: 'Mesaje SPV' }));
    await user.click(within(screen.getByRole('dialog', { name: 'Mesaje SPV' })).getByRole('button', { name: 'Închide' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('loads reCAPTCHA as soon as the login tab is shown', async () => {
    renderApp('/', {
      'GET /auth/me': { status: 401 },
      'GET /public/stats': { status: 200, body: STATS },
    });
    expect(await screen.findByRole('tab', { name: 'Autentificare' })).toHaveAttribute('aria-selected', 'true');
    expect(loadRecaptcha).toHaveBeenCalledTimes(1);
  });

  it('does not load reCAPTCHA for a signed-in accountant', async () => {
    renderApp('/', {
      'GET /auth/me': { status: 200, body: ME },
      'GET /public/stats': { status: 200, body: STATS },
    });
    await screen.findAllByRole('link', { name: 'Deschide aplicația' });
    expect(loadRecaptcha).not.toHaveBeenCalled();
    expect(document.body).not.toHaveClass('recaptcha-on');
  });

  it('shows the reCAPTCHA badge only while the login card is on screen', async () => {
    const user = userEvent.setup();
    const { router } = renderApp('/', {
      'GET /auth/me': { status: 401 },
      'GET /public/stats': { status: 200, body: STATS },
      'POST /auth/login': { status: 200, body: ME },
      'GET /accountants/1/companies': { status: 200, body: [] },
      'GET /accountants/1/anaf/connections': { status: 200, body: [] },
    });
    await screen.findByRole('tab', { name: 'Autentificare' });
    expect(document.body).toHaveClass('recaptcha-on');
    await user.type(screen.getByLabelText('Email'), 'andrei@cabinet.ro');
    await user.type(screen.getByLabelText('Parolă'), 'a-long-password');
    await user.click(screen.getByRole('button', { name: 'Intră în cont' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/accountants/1'));
    expect(document.body).not.toHaveClass('recaptcha-on');
  });

  it('keeps the page usable when the counters cannot be loaded', async () => {
    renderApp('/', {
      'GET /auth/me': { status: 401 },
      'GET /public/stats': { status: 429, body: { message: 'ThrottlerException: Too Many Requests' } },
    });
    expect(
      await screen.findByText('Cifrele nu sunt disponibile momentan. Reveniți în câteva minute.'),
    ).toBeInTheDocument();
    const counters = screen.getByRole('region', { name: 'SPVDirect în cifre' });
    expect(within(counters).getAllByText('—')).toHaveLength(6);
    expect(screen.getByRole('heading', { name: 'Funcționalități' })).toBeInTheDocument();
  });

  it('shows a signed-in accountant the way back to the app', async () => {
    const { router } = renderApp('/', {
      'GET /auth/me': { status: 200, body: ME },
      'GET /public/stats': { status: 200, body: STATS },
    });
    const links = await screen.findAllByRole('link', { name: 'Deschide aplicația' });
    expect(links).toHaveLength(3);
    for (const link of links) expect(link).toHaveAttribute('href', '/accountants/1');
    expect(screen.queryByRole('button', { name: /Creează cont/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
  });
});
