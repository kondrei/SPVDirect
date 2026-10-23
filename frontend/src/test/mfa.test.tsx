import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MfaMethod } from '../api/enums';
import type { MfaStatus } from '../api/types';
import { ME, renderApp } from './render';

vi.mock('../lib/recaptcha', () => ({
  loadRecaptcha: vi.fn(() => Promise.resolve()),
  recaptchaToken: vi.fn(() => Promise.resolve('captcha-token')),
}));

vi.mock('qrcode', () => ({
  default: { toDataURL: vi.fn(() => Promise.resolve('data:image/png;base64,UVI=')) },
}));

afterEach(() => {
  vi.unstubAllGlobals();
});

const signedOut = {
  'GET /auth/me': { status: 401 },
  'GET /public/stats': {
    status: 200,
    body: {
      accountants: 1,
      companies: 1,
      invoices: 1,
      efacturaUploads: 1,
      spvMessages: 1,
      anafConnections: 1,
      updatedAt: '2026-10-12T08:30:00Z',
    },
  },
  'GET /accountants/1/companies': { status: 200, body: [] },
  'GET /accountants/1/anaf/connections': { status: 200, body: [] },
};

type Api = Parameters<typeof renderApp>[1];

function loginApi(methods: MfaMethod[], extra: Api, bodies: unknown[] = []): Api {
  return {
    ...signedOut,
    'POST /auth/login': { status: 200, body: { mfaRequired: true, methods } },
    'POST /auth/login/mfa': (init) => {
      bodies.push(JSON.parse(String(init?.body)));
      return { status: 200, body: ME };
    },
    ...extra,
  };
}

async function enterPassword(user: ReturnType<typeof userEvent.setup>) {
  await screen.findByRole('tab', { name: 'Autentificare' });
  await user.type(screen.getByLabelText('Email'), 'andrei@cabinet.ro');
  await user.type(screen.getByLabelText('Parolă'), 'a-long-password');
  await user.click(screen.getByRole('button', { name: 'Intră în cont' }));
}

describe('login with two-step verification', () => {
  it('asks for the app code after the password and then opens the app', async () => {
    const user = userEvent.setup();
    const bodies: unknown[] = [];
    const { router, calls } = renderApp('/', loginApi([MfaMethod.App], {}, bodies));
    await enterPassword(user);
    const code = await screen.findByLabelText('Cod de verificare');
    expect(router.state.location.pathname).toBe('/');
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Trimite codul pe email' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Verifică codul' }));
    expect(screen.getByText('Introduceți 6 cifre sau codul de recuperare din 5 cifre.')).toBeInTheDocument();
    expect(bodies).toEqual([]);

    await user.type(code, '123 456');
    await user.click(screen.getByLabelText('Nu mai cere codul pe acest dispozitiv 30 de zile'));
    await user.click(screen.getByRole('button', { name: 'Verifică codul' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/accountants/1'));
    expect(bodies).toEqual([{ code: '123456', method: MfaMethod.App, rememberDevice: true }]);
    expect(calls).not.toContain('POST /auth/login/mfa/email');
  });

  it('emails the code straight away when email is the only method', async () => {
    const user = userEvent.setup();
    const bodies: unknown[] = [];
    const { router, calls } = renderApp(
      '/',
      loginApi(
        [MfaMethod.Email],
        { 'POST /auth/login/mfa/email': { status: 200, body: { sentTo: 'a***@cabinet.ro' } } },
        bodies,
      ),
    );
    await enterPassword(user);
    expect(await screen.findByText('Am trimis codul la a***@cabinet.ro.')).toBeInTheDocument();
    expect(calls.filter((c) => c === 'POST /auth/login/mfa/email')).toHaveLength(1);
    await user.type(screen.getByLabelText('Cod de verificare'), '424242');
    await user.click(screen.getByRole('button', { name: 'Verifică codul' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/accountants/1'));
    expect(bodies).toEqual([{ code: '424242', method: MfaMethod.Email, rememberDevice: false }]);
  });

  it('lets the user choose email when both methods are on', async () => {
    const user = userEvent.setup();
    const bodies: unknown[] = [];
    const { calls } = renderApp(
      '/',
      loginApi(
        [MfaMethod.App, MfaMethod.Email],
        { 'POST /auth/login/mfa/email': { status: 200, body: { sentTo: 'a***@cabinet.ro' } } },
        bodies,
      ),
    );
    await enterPassword(user);
    expect(await screen.findByLabelText('Aplicația de autentificare')).toBeChecked();
    expect(calls).not.toContain('POST /auth/login/mfa/email');
    await user.click(screen.getByLabelText('Email'));
    await user.click(screen.getByRole('button', { name: 'Trimite codul pe email' }));
    expect(await screen.findByText('Am trimis codul la a***@cabinet.ro.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Trimite alt cod' })).toBeInTheDocument();
    await user.type(screen.getByLabelText('Cod de verificare'), '424242');
    await user.click(screen.getByRole('button', { name: 'Verifică codul' }));
    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toMatchObject({ code: '424242', method: MfaMethod.Email });
  });

  it('shows when the code email cannot be sent yet', async () => {
    const user = userEvent.setup();
    renderApp(
      '/',
      loginApi([MfaMethod.Email], {
        'POST /auth/login/mfa/email': {
          status: 429,
          body: { message: 'Am trimis deja un cod. Așteptați un minut înainte să cereți altul.' },
        },
      }),
    );
    await enterPassword(user);
    expect(
      await screen.findByText('Am trimis deja un cod. Așteptați un minut înainte să cereți altul.'),
    ).toBeInTheDocument();
  });

  it('sends a 5-digit code as the recovery code', async () => {
    const user = userEvent.setup();
    const bodies: unknown[] = [];
    const { router } = renderApp('/', loginApi([MfaMethod.App], {}, bodies));
    await enterPassword(user);
    await user.type(await screen.findByLabelText('Cod de verificare'), '04821');
    await user.click(screen.getByRole('button', { name: 'Verifică codul' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/accountants/1'));
    expect(bodies).toEqual([{ code: '04821', method: MfaMethod.Recovery, rememberDevice: false }]);
  });

  it('shows a wrong code and stays on the code step', async () => {
    const user = userEvent.setup();
    const { router } = renderApp(
      '/',
      loginApi([MfaMethod.App], {
        'POST /auth/login/mfa': { status: 401, body: { message: 'Cod de verificare incorect' } },
      }),
    );
    await enterPassword(user);
    await user.type(await screen.findByLabelText('Cod de verificare'), '000000');
    await user.click(screen.getByRole('button', { name: 'Verifică codul' }));
    expect(await screen.findByText('Cod de verificare incorect')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/');
  });

  it('goes back to the password form', async () => {
    const user = userEvent.setup();
    renderApp('/', loginApi([MfaMethod.App], {}));
    await enterPassword(user);
    await user.click(await screen.findByRole('button', { name: 'Înapoi' }));
    expect(screen.getByLabelText('Parolă')).toHaveValue('');
    expect(screen.queryByLabelText('Cod de verificare')).not.toBeInTheDocument();
  });
});

const PROFILE = {
  ...ME,
  phone: null,
  ceccarMember: false,
  professionalTitle: null,
  ceccarNumber: null,
  ceccarBranch: null,
  ccfNumber: null,
  firmName: null,
  firmCui: null,
  firmCaenCode: null,
  firmCaen: null,
  updatedAt: ME.createdAt,
};

const OFF: MfaStatus = {
  enabled: false,
  appEnabledAt: null,
  emailEnabledAt: null,
  recoveryCodeAvailable: false,
};
const APP_ON: MfaStatus = {
  ...OFF,
  enabled: true,
  appEnabledAt: '2026-10-01T10:00:00Z',
  recoveryCodeAvailable: true,
};
const BOTH_ON: MfaStatus = { ...APP_ON, emailEnabledAt: '2026-10-02T10:00:00Z' };

function profileApi(mfa: MfaStatus | (() => { status: number; body: MfaStatus }), extra: Api = {}): Api {
  return {
    'GET /auth/me': { status: 200, body: ME },
    'GET /accountants/1/companies': { status: 200, body: [] },
    'GET /accountants/1/anaf/connections': { status: 200, body: [] },
    'GET /accountants/1/profile': { status: 200, body: PROFILE },
    'GET /accountants/1/mfa': typeof mfa === 'function' ? mfa : { status: 200, body: mfa },
    ...extra,
  };
}

const json = (init: RequestInit | undefined) => JSON.parse(String(init?.body)) as unknown;

describe('two-step verification on Profil', () => {
  it('turns the app on: password, QR code and app code, then shows the recovery code once', async () => {
    const user = userEvent.setup();
    const bodies: Record<string, unknown> = {};
    let status = OFF;
    renderApp(
      '/accountants/1/profile',
      profileApi(() => ({ status: 200, body: status }), {
        'POST /accountants/1/mfa/app/setup': (init) => {
          bodies.setup = json(init);
          return {
            status: 200,
            body: { secret: 'JBSWY3DPEHPK3PXP', otpauthUri: 'otpauth://totp/SPVDirect:a?secret=JBSWY3DPEHPK3PXP' },
          };
        },
        'POST /accountants/1/mfa/app/setup/confirm': (init) => {
          bodies.confirm = json(init);
          status = APP_ON;
          return { status: 200, body: { recoveryCode: '04821' } };
        },
      }),
    );
    expect(await screen.findByText('Aplicația de autentificare')).toBeInTheDocument();
    expect(screen.getAllByText('Dezactivată')).toHaveLength(2);
    await user.click(screen.getAllByRole('button', { name: 'Activează' })[0]);
    await user.type(screen.getByLabelText('Parola, pentru confirmare'), 'parola-mea');
    await user.click(screen.getByRole('button', { name: 'Continuă' }));

    expect(await screen.findByAltText('Cod QR pentru aplicația de autentificare')).toHaveAttribute(
      'src',
      'data:image/png;base64,UVI=',
    );
    expect(screen.getByLabelText('Cheie pentru introducere manuală')).toHaveTextContent('JBSWY3DPEHPK3PXP');
    await user.type(screen.getByLabelText('Cod din aplicație'), '12345');
    await user.click(screen.getByRole('button', { name: 'Activează' }));
    expect(screen.getByText('Introduceți cele 6 cifre din aplicație.')).toBeInTheDocument();

    await user.type(screen.getByLabelText('Cod din aplicație'), '6');
    await user.click(screen.getByRole('button', { name: 'Activează' }));
    expect(await screen.findByLabelText('Cod de recuperare')).toHaveTextContent('04821');
    expect(bodies).toEqual({ setup: { password: 'parola-mea' }, confirm: { code: '123456' } });

    await user.click(screen.getByRole('button', { name: 'L-am salvat' }));
    expect(await screen.findByText('Activă')).toBeInTheDocument();
    expect(screen.queryByText('04821')).not.toBeInTheDocument();
  });

  it('turns email on as a second method, keeping the existing recovery code', async () => {
    const user = userEvent.setup();
    const bodies: Record<string, unknown> = {};
    let status = APP_ON;
    renderApp(
      '/accountants/1/profile',
      profileApi(() => ({ status: 200, body: status }), {
        'POST /accountants/1/mfa/email/setup': (init) => {
          bodies.setup = json(init);
          return { status: 200, body: { sentTo: 'a***@cabinet.ro' } };
        },
        'POST /accountants/1/mfa/email/setup/confirm': (init) => {
          bodies.confirm = json(init);
          status = BOTH_ON;
          return { status: 200, body: { recoveryCode: null } };
        },
      }),
    );
    await screen.findByText('Cod pe email');
    await user.click(screen.getByRole('button', { name: 'Activează' }));
    await user.type(screen.getByLabelText('Parola, pentru confirmare'), 'parola-mea');
    await user.click(screen.getByRole('button', { name: 'Trimite codul pe email' }));
    expect(await screen.findByText('Am trimis un cod de 6 cifre la a***@cabinet.ro.')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Cod din email'), '424242');
    await user.click(screen.getByRole('button', { name: 'Activează' }));
    expect(await screen.findByText('Codul pe email a fost activat.')).toBeInTheDocument();
    expect(screen.queryByLabelText('Cod de recuperare')).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getAllByText('Activă')).toHaveLength(2));
    expect(bodies).toEqual({ setup: { password: 'parola-mea' }, confirm: { code: '424242' } });
  });

  it('shows a wrong password when starting a setup', async () => {
    const user = userEvent.setup();
    renderApp(
      '/accountants/1/profile',
      profileApi(OFF, {
        'POST /accountants/1/mfa/app/setup': { status: 400, body: { message: 'Parola este incorectă' } },
      }),
    );
    await user.click((await screen.findAllByRole('button', { name: 'Activează' }))[0]);
    await user.type(screen.getByLabelText('Parola, pentru confirmare'), 'gresita');
    await user.click(screen.getByRole('button', { name: 'Continuă' }));
    expect(await screen.findByText('Parola este incorectă')).toBeInTheDocument();
  });

  it('warns when there is no recovery code left and generates a new one', async () => {
    const user = userEvent.setup();
    renderApp(
      '/accountants/1/profile',
      profileApi(
        { ...APP_ON, recoveryCodeAvailable: false },
        { 'POST /accountants/1/mfa/recovery-code': { status: 200, body: { recoveryCode: '55555' } } },
      ),
    );
    expect(await screen.findByText('Nu aveți un cod de recuperare valabil')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cod de recuperare nou' }));
    await user.type(screen.getByLabelText('Parola, pentru confirmare'), 'parola-mea');
    await user.click(screen.getByRole('button', { name: 'Generează un cod nou' }));
    expect(await screen.findByLabelText('Cod de recuperare')).toHaveTextContent('55555');
  });

  it('turns one method off and says the other one stays on', async () => {
    const user = userEvent.setup();
    let status = BOTH_ON;
    let body: unknown;
    renderApp(
      '/accountants/1/profile',
      profileApi(() => ({ status: 200, body: status }), {
        'DELETE /accountants/1/mfa/app': (init) => {
          body = json(init);
          status = { ...BOTH_ON, appEnabledAt: null };
          return { status: 204 };
        },
      }),
    );
    await waitFor(() => expect(screen.getAllByRole('button', { name: 'Dezactivează' })).toHaveLength(2));
    await user.click(screen.getAllByRole('button', { name: 'Dezactivează' })[0]);
    expect(screen.getByText(/Cealaltă metodă rămâne activă/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Dezactivează aplicația' }));
    expect(screen.getByText('Introduceți parola.')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Parola, pentru confirmare'), 'parola-mea');
    await user.click(screen.getByRole('button', { name: 'Dezactivează aplicația' }));
    expect(await screen.findByText('Aplicația de autentificare a fost dezactivată.')).toBeInTheDocument();
    expect(body).toEqual({ password: 'parola-mea' });
    await waitFor(() => expect(screen.getAllByText('Activă')).toHaveLength(1));
  });

  it('warns that turning off the only method leaves just the password', async () => {
    const user = userEvent.setup();
    renderApp('/accountants/1/profile', profileApi(APP_ON));
    await user.click(await screen.findByRole('button', { name: 'Dezactivează' }));
    expect(screen.getByText(/Este singura metodă activă/)).toBeInTheDocument();
  });
});

describe('two-step verification banner on Panou', () => {
  const panou = (mfa: { status: number; body?: unknown }): Api => ({
    'GET /auth/me': { status: 200, body: ME },
    'GET /accountants/1/companies': { status: 200, body: [] },
    'GET /accountants/1/anaf/connections': { status: 200, body: [] },
    'GET /accountants/1/mfa': mfa,
  });

  it('explains why to turn it on and links to Profil while it is off', async () => {
    const user = userEvent.setup();
    const { router } = renderApp('/accountants/1', panou({ status: 200, body: OFF }));
    expect(await screen.findByText('Protejați contul cu autentificarea în doi pași')).toBeInTheDocument();
    expect(screen.getByText(/o parolă furată nu mai este/)).toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: 'Activează din Profil' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/accountants/1/profile'));
  });

  it('is not shown once a method is on, or when the status cannot be read', async () => {
    for (const mfa of [
      { status: 200, body: { ...OFF, enabled: true, emailEnabledAt: '2026-10-01T10:00:00Z' } },
      { status: 500, body: {} },
    ]) {
      const { unmount, calls } = renderApp('/accountants/1', panou(mfa));
      await waitFor(() => expect(calls).toContain('GET /accountants/1/mfa'));
      await screen.findByRole('heading', { level: 1 });
      expect(screen.queryByText('Protejați contul cu autentificarea în doi pași')).not.toBeInTheDocument();
      unmount();
      vi.unstubAllGlobals();
    }
  });
});
