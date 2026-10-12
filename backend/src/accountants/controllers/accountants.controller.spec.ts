import { BadRequestException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants.js';
import { AccountantParamGuard } from '../../auth/guards/accountant-param.guard.js';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard.js';
import { AccountantsController } from './accountants.controller.js';
import type { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import type { AuthService } from '../../auth/services/auth.service.js';
import { SESSION_COOKIE } from '../../auth/session.js';
import type { AccountantsService } from '../services/accountants.service.js';

function build(service: object, auth: object = {}) {
  return new AccountantsController(
    service as AccountantsService,
    auth as AuthService,
    { get: () => 'development' } as unknown as ConfigService,
  );
}

describe('AccountantsController', () => {
  it('requires a session for the same accountant as the URL', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, AccountantsController)).toEqual(
      [JwtAuthGuard, AccountantParamGuard],
    );
  });

  it('normalizes the CUI before the ANAF lookup and rejects invalid ones', () => {
    const service = { lookupFirm: vi.fn().mockResolvedValue({}) };
    const controller = build(service);
    void controller.lookupFirm(7, 'RO14399840');
    expect(service.lookupFirm).toHaveBeenCalledWith(7, '14399840');
    expect(() => controller.lookupFirm(7, 'abc')).toThrow(BadRequestException);
    expect(service.lookupFirm).toHaveBeenCalledOnce();
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
