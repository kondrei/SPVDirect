import { UnauthorizedException } from '@nestjs/common';
import type { CommandBus } from '@nestjs/cqrs';
import type { Request, Response } from 'express';
import type { AccountantsService } from '../../accountants/services/accountants.service.js';
import type { ActivityLogsService } from '../../api-logs/activity-logs.service.js';
import { ActivityAction } from '../../api-logs/dto/api-log.enums.js';
import { fakeActivityLogs } from '../../testing/activity-logs.js';
import { MFA_LOGIN_EXPIRED } from '../dto/auth.constants.js';
import type { AuthService } from '../services/auth.service.js';
import type { MfaService } from '../services/mfa.service.js';
import type { SessionCookieService } from '../services/session-cookie.service.js';
import { AuthController } from './auth.controller.js';
import { MfaMethod } from '../dto/auth.enums.js';

const accountant = {
  id: 7,
  email: 'ana@example.ro',
  name: 'Ana',
  createdAt: new Date('2026-09-01T00:00:00Z'),
  mfaChangedAt: null,
  passwordChangedAt: null,
};

function build(methods: MfaMethod[] = []) {
  const found = { ...accountant };
  const auth = {
    validateLogin: vi.fn().mockResolvedValue(found),
    isSessionValid: vi.fn().mockResolvedValue(true),
  };
  const accountants = { findById: vi.fn().mockResolvedValue(found) };
  const cookies = {
    issue: vi.fn().mockResolvedValue(undefined),
    clear: vi.fn(),
    issueMfaPending: vi.fn().mockResolvedValue(undefined),
    readMfaPending: vi
      .fn()
      .mockResolvedValue({ accountantId: 7, issuedAt: 1_800_000_000 }),
    clearMfaPending: vi.fn(),
    issueMfaTrust: vi.fn().mockResolvedValue(undefined),
    readMfaTrust: vi.fn().mockResolvedValue(null),
  };
  const mfa = {
    factors: vi.fn().mockResolvedValue(methods),
    trustsDevice: vi.fn().mockReturnValue(false),
    verifyLogin: vi.fn().mockResolvedValue({ method: MfaMethod.App }),
    sendLoginEmailCode: vi
      .fn()
      .mockResolvedValue({ sentTo: 'a***@example.ro' }),
  };
  const activity = fakeActivityLogs();
  const controller = new AuthController(
    auth as unknown as AuthService,
    accountants as unknown as AccountantsService,
    {} as CommandBus,
    cookies as unknown as SessionCookieService,
    activity as unknown as ActivityLogsService,
    mfa as unknown as MfaService,
  );
  return { controller, auth, accountants, cookies, mfa, activity };
}

const req = {} as Request;
const res = {} as Response;
const dto = { email: 'ana@example.ro', password: 'a-long-password' };

describe('AuthController.login', () => {
  it('signs in straight away when MFA is off', async () => {
    const { controller, cookies, mfa, activity } = build();
    await expect(controller.login(dto, req, res)).resolves.toMatchObject({
      id: 7,
      email: 'ana@example.ro',
    });
    expect(cookies.issue).toHaveBeenCalledWith(res, 7);
    expect(cookies.issueMfaPending).not.toHaveBeenCalled();
    expect(mfa.factors).toHaveBeenCalledWith(7);
    expect(mfa.trustsDevice).not.toHaveBeenCalled();
    expect(activity.record).toHaveBeenCalledWith(
      7,
      expect.objectContaining({ action: ActivityAction.LoggedIn }),
    );
  });

  it('asks for the code without a session when MFA is on', async () => {
    const { controller, cookies, activity } = build([MfaMethod.App]);
    await expect(controller.login(dto, req, res)).resolves.toEqual({
      mfaRequired: true,
      methods: [MfaMethod.App],
    });
    expect(cookies.clear).toHaveBeenCalledWith(res);
    expect(cookies.issueMfaPending).toHaveBeenCalledWith(res, 7);
    expect(cookies.issue).not.toHaveBeenCalled();
    expect(activity.record).not.toHaveBeenCalled();
  });

  it('skips the code on a trusted device', async () => {
    const { controller, cookies, mfa } = build([MfaMethod.App]);
    const trust = { accountantId: 7, issuedAt: 1_800_000_000 };
    cookies.readMfaTrust.mockResolvedValue(trust);
    mfa.trustsDevice.mockReturnValue(true);
    await expect(controller.login(dto, req, res)).resolves.toMatchObject({
      id: 7,
    });
    expect(mfa.trustsDevice).toHaveBeenCalledWith(
      expect.objectContaining({ id: 7 }),
      trust,
    );
    expect(cookies.issue).toHaveBeenCalledWith(res, 7);
    expect(cookies.issueMfaPending).not.toHaveBeenCalled();
  });
});

describe('AuthController.loginMfa', () => {
  it('opens the session after a valid code and drops the pending cookie', async () => {
    const { controller, cookies, mfa, activity } = build();
    await expect(
      controller.loginMfa({ code: '123456' }, req, res),
    ).resolves.toMatchObject({ id: 7 });
    expect(mfa.verifyLogin).toHaveBeenCalledWith(7, '123456', undefined);
    expect(cookies.clearMfaPending).toHaveBeenCalledWith(res);
    expect(cookies.issue).toHaveBeenCalledWith(res, 7);
    expect(cookies.issueMfaTrust).not.toHaveBeenCalled();
    expect(activity.record).toHaveBeenCalledWith(
      7,
      expect.objectContaining({ action: ActivityAction.LoggedIn }),
    );
  });

  it('remembers the device only when asked', async () => {
    const { controller, cookies } = build();
    await controller.loginMfa(
      { code: '123456', rememberDevice: true },
      req,
      res,
    );
    expect(cookies.issueMfaTrust).toHaveBeenCalledWith(res, 7);
  });

  it('answers 401 without a pending login', async () => {
    const { controller, cookies, mfa } = build();
    cookies.readMfaPending.mockResolvedValue(null);
    await expect(
      controller.loginMfa({ code: '123456' }, req, res),
    ).rejects.toThrow(new UnauthorizedException(MFA_LOGIN_EXPIRED));
    expect(mfa.verifyLogin).not.toHaveBeenCalled();
  });

  it('answers 401 when the password changed or the account closed meanwhile', async () => {
    const { controller, auth, mfa } = build();
    auth.isSessionValid.mockResolvedValue(false);
    await expect(
      controller.loginMfa({ code: '123456' }, req, res),
    ).rejects.toThrow(UnauthorizedException);
    expect(auth.isSessionValid).toHaveBeenCalledWith(7, 1_800_000_000);
    expect(mfa.verifyLogin).not.toHaveBeenCalled();
  });

  it('issues nothing when the code is wrong', async () => {
    const { controller, cookies, mfa } = build();
    mfa.verifyLogin.mockRejectedValue(new UnauthorizedException());
    await expect(
      controller.loginMfa({ code: '000000', rememberDevice: true }, req, res),
    ).rejects.toThrow(UnauthorizedException);
    expect(cookies.issue).not.toHaveBeenCalled();
    expect(cookies.issueMfaTrust).not.toHaveBeenCalled();
    expect(cookies.clearMfaPending).not.toHaveBeenCalled();
  });
});

describe('AuthController email code at login', () => {
  it('lists every method that is on so the user can choose', async () => {
    const { controller } = build([MfaMethod.App, MfaMethod.Email]);
    await expect(controller.login(dto, req, res)).resolves.toEqual({
      mfaRequired: true,
      methods: [MfaMethod.App, MfaMethod.Email],
    });
  });

  it('asks for the code with email alone too', async () => {
    const { controller, cookies } = build([MfaMethod.Email]);
    await expect(controller.login(dto, req, res)).resolves.toEqual({
      mfaRequired: true,
      methods: [MfaMethod.Email],
    });
    expect(cookies.issue).not.toHaveBeenCalled();
  });

  it('sends the emailed code only during a pending login', async () => {
    const { controller, cookies, mfa } = build();
    await expect(controller.sendLoginEmailCode(req)).resolves.toEqual({
      sentTo: 'a***@example.ro',
    });
    expect(mfa.sendLoginEmailCode).toHaveBeenCalledWith(7);
    cookies.readMfaPending.mockResolvedValue(null);
    await expect(controller.sendLoginEmailCode(req)).rejects.toThrow(
      new UnauthorizedException(MFA_LOGIN_EXPIRED),
    );
    expect(mfa.sendLoginEmailCode).toHaveBeenCalledTimes(1);
  });

  it('passes the chosen method on to the check', async () => {
    const { controller, mfa } = build();
    await controller.loginMfa(
      { code: '424242', method: MfaMethod.Email },
      req,
      res,
    );
    expect(mfa.verifyLogin).toHaveBeenCalledWith(7, '424242', MfaMethod.Email);
  });
});

describe('AuthController.logout', () => {
  it('clears the session and any pending MFA login', () => {
    const { controller, cookies } = build();
    controller.logout(res);
    expect(cookies.clear).toHaveBeenCalledWith(res);
    expect(cookies.clearMfaPending).toHaveBeenCalledWith(res);
  });
});
