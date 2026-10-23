import { BadRequestException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants.js';
import { ParseCuiPipe } from '../../companies/dto/company.dto.js';
import { paramPipes } from '../../testing/param-pipes.js';
import { AccountantParamGuard } from '../../auth/guards/accountant-param.guard.js';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard.js';
import { AccountantsController } from './accountants.controller.js';
import type { ConfigService } from '@nestjs/config';
import type { JwtService } from '@nestjs/jwt';
import type { Response } from 'express';
import type { AuthService } from '../../auth/services/auth.service.js';
import { SessionCookieService } from '../../auth/services/session-cookie.service.js';
import { SESSION_COOKIE } from '../../auth/session.js';
import type { AccountantsService } from '../services/accountants.service.js';

function build(service: object, auth: object = {}) {
  return new AccountantsController(
    service as AccountantsService,
    new SessionCookieService(
      auth as AuthService,
      {} as JwtService,
      { get: () => 'development' } as unknown as ConfigService,
    ),
  );
}

describe('AccountantsController', () => {
  it('requires a session for the same accountant as the URL', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, AccountantsController)).toEqual(
      [JwtAuthGuard, AccountantParamGuard],
    );
  });

  it('validates the CUI with ParseCuiPipe before the ANAF lookup', () => {
    expect(paramPipes(AccountantsController, 'lookupFirm', 'cui')).toContain(
      ParseCuiPipe,
    );
  });

  it('delegates to the service with the URL accountant id', async () => {
    const service = {
      getProfile: vi.fn().mockResolvedValue({ id: 7 }),
      updateProfile: vi.fn().mockResolvedValue({ id: 7 }),
    };
    const controller = build(service);
    await controller.getProfile(7);
    await controller.updateProfile(7, { name: 'Ana' });
    expect(service.getProfile).toHaveBeenCalledWith(7);
    expect(service.updateProfile).toHaveBeenCalledWith(7, { name: 'Ana' });
  });

  it('changes the password and replaces the session cookie', async () => {
    const service = { changePassword: vi.fn().mockResolvedValue(undefined) };
    const auth = { signSession: vi.fn().mockResolvedValue('new-session') };
    const res = { cookie: vi.fn() };
    const controller = build(service, auth);
    const dto = { currentPassword: 'a', newPassword: 'b'.repeat(10) };
    await expect(
      controller.changePassword(7, dto, res as unknown as Response),
    ).resolves.toBeUndefined();
    expect(service.changePassword).toHaveBeenCalledWith(7, dto);
    expect(auth.signSession).toHaveBeenCalledWith(7);
    expect(res.cookie).toHaveBeenCalledWith(
      SESSION_COOKIE,
      'new-session',
      expect.objectContaining({ httpOnly: true, sameSite: 'lax' }),
    );
  });

  it('keeps the old session when the password change fails', async () => {
    const service = {
      changePassword: vi.fn().mockRejectedValue(new BadRequestException()),
    };
    const auth = { signSession: vi.fn() };
    const res = { cookie: vi.fn() };
    await expect(
      build(service, auth).changePassword(
        7,
        { currentPassword: 'a', newPassword: 'b'.repeat(10) },
        res as unknown as Response,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(res.cookie).not.toHaveBeenCalled();
  });
});
