import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ME, renderApp } from './render';

afterEach(() => vi.unstubAllGlobals());

const future = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();
const CONN = {
  id: 'c1', accountantId: 'a1', label: 'Popescu — token USB', certSerial: '4C000012A9F3', roles: ['EFACTURA'], source: 'self',
  accessExpiresAt: future(80), refreshExpiresAt: future(12), lastRefreshedAt: null, status: 'active', createdAt: future(-1), updatedAt: future(-1),
};

describe('session', () => {
  it('sends signed-out users to /login and keeps where they were going', async () => {
    const { router } = renderApp('/companies', { 'GET /auth/me': { status: 401, body: { message: 'Unauthorized' } } });
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
    expect(router.state.location.search).toBe('?next=%2Fcompanies');
    expect(await screen.findByRole('heading', { name: 'Autentificare' })).toBeInTheDocument();
  });

  it('logs in and returns to the requested page', async () => {
    const user = userEvent.setup();
    let body = '';
    const { router } = renderApp('/login?next=%2Fcompanies', {
      'GET /auth/me': { status: 401 },
      'POST /auth/login': (init) => { body = String(init?.body); return { status: 200, body: ME }; },
      'GET /companies': { status: 200, body: [] },
      'GET /anaf/connections': { status: 200, body: [] },
    });
    await user.type(await screen.findByLabelText('Email'), 'andrei@cabinet.ro');
    await user.type(screen.getByLabelText('Parolă'), 'a-long-password');
    await user.click(screen.getByRole('button', { name: 'Intră în cont' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/companies'));
    expect(JSON.parse(body)).toEqual({ email: 'andrei@cabinet.ro', password: 'a-long-password' });
  });

  it('shows the backend message when login fails', async () => {
    const user = userEvent.setup();
    renderApp('/login', { 'GET /auth/me': { status: 401 }, 'POST /auth/login': { status: 401, body: { message: 'Email sau parolă greșită' } } });
    await user.type(await screen.findByLabelText('Email'), 'x@y.ro');
    await user.type(screen.getByLabelText('Parolă'), 'wrong-password');
    await user.click(screen.getByRole('button', { name: 'Intră în cont' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Email sau parolă greșită');
  });
});

describe('companies', () => {
  it('validates the CUI before calling the API, then posts it without RO', async () => {
    const user = userEvent.setup();
    let posted: unknown;
    const { calls } = renderApp('/companies?add=1', {
      'GET /auth/me': { status: 200, body: ME },
      'GET /companies': { status: 200, body: [] },
      'GET /anaf/connections': { status: 200, body: [] },
      'POST /companies': (init) => { posted = JSON.parse(String(init?.body)); return { status: 201, body: { id: 'co1' } }; },
    });
    const cui = await screen.findByLabelText('CUI');
    await user.type(cui, 'RO12A');
    await user.type(screen.getByLabelText('Denumire'), 'Agro Vest SRL');
    await user.click(screen.getByRole('button', { name: 'Adaugă' }));
    expect(await screen.findByText(/CUI invalid/)).toBeInTheDocument();
    expect(calls).not.toContain('POST /companies');

    await user.clear(cui);
    await user.type(cui, 'RO 14399840');
    await user.click(screen.getByRole('button', { name: 'Adaugă' }));
    await waitFor(() => expect(posted).toEqual({ cui: '14399840', name: 'Agro Vest SRL' }));
  });

  it('lists companies with their certificate status', async () => {
    renderApp('/companies', {
      'GET /auth/me': { status: 200, body: ME },
      'GET /companies': { status: 200, body: [
        { id: 'co1', accountantId: 'a1', cui: '14399840', name: 'Agro Vest SRL', anafConnectionId: 'c1', createdAt: '', updatedAt: '' },
        { id: 'co2', accountantId: 'a1', cui: '40211987', name: 'Brutăria Ionescu SRL', anafConnectionId: null, createdAt: '', updatedAt: '' },
      ] },
      'GET /anaf/connections': { status: 200, body: [CONN] },
    });
    expect(await screen.findByRole('link', { name: 'Agro Vest SRL' })).toHaveAttribute('href', '/companies/co1');
    expect(screen.getByText('RO 14399840')).toBeInTheDocument();
    expect(screen.getByText('Expiră curând')).toBeInTheDocument();
    expect(screen.getByText('Fără certificat')).toBeInTheDocument();
  });
});

describe('connections', () => {
  it('shows the OAuth callback error as plain text', async () => {
    renderApp('/connections?status=error&message=%3Cimg%20src%3Dx%20onerror%3Dalert(1)%3E', {
      'GET /auth/me': { status: 200, body: ME },
      'GET /companies': { status: 200, body: [] },
      'GET /anaf/connections': { status: 200, body: [] },
    });
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('<img src=x onerror=alert(1)>');
    expect(alert.querySelector('img')).toBeNull();
  });

  it('links "Conectează certificat" to the backend OAuth start as a full navigation', async () => {
    renderApp('/connections', {
      'GET /auth/me': { status: 200, body: ME },
      'GET /companies': { status: 200, body: [] },
      'GET /anaf/connections': { status: 200, body: [CONN] },
    });
    const links = await screen.findAllByRole('link', { name: /Conectează certificat/ });
    expect(links[0]).toHaveAttribute('href', '/api/anaf/connect');
    expect(await screen.findByText('Expiră în 12 zile')).toBeInTheDocument();
  });
});
