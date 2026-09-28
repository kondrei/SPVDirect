import { BadRequestException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants.js';
import { AccountantParamGuard } from '../auth/accountant-param.guard.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { AccountantsController } from './accountants.controller.js';
import type { AccountantsService } from './accountants.service.js';

describe('AccountantsController', () => {
  it('requires a session for the same accountant as the URL', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, AccountantsController)).toEqual(
      [JwtAuthGuard, AccountantParamGuard],
    );
  });

  it('normalizes the CUI before the ANAF lookup and rejects invalid ones', () => {
    const service = { lookupFirm: vi.fn().mockResolvedValue({}) };
    const controller = new AccountantsController(
      service as unknown as AccountantsService,
    );
    void controller.lookupFirm(7, 'RO14399840');
    expect(service.lookupFirm).toHaveBeenCalledWith(7, '14399840');
    expect(() => controller.lookupFirm(7, 'abc')).toThrow(BadRequestException);
    expect(service.lookupFirm).toHaveBeenCalledOnce();
  });

  it('delegates to the service with the URL accountant id', async () => {
    const service = {
      getProfile: vi.fn().mockResolvedValue({ id: 7 }),
      updateProfile: vi.fn().mockResolvedValue({ id: 7 }),
      changePassword: vi.fn().mockResolvedValue(undefined),
    };
    const controller = new AccountantsController(
      service as unknown as AccountantsService,
    );
    await controller.getProfile(7);
    await controller.updateProfile(7, { name: 'Ana' });
    await expect(
      controller.changePassword(7, {
        currentPassword: 'a',
        newPassword: 'b'.repeat(10),
      }),
    ).resolves.toBeUndefined();
    expect(service.getProfile).toHaveBeenCalledWith(7);
    expect(service.updateProfile).toHaveBeenCalledWith(7, { name: 'Ana' });
    expect(service.changePassword).toHaveBeenCalledWith(7, {
      currentPassword: 'a',
      newPassword: 'b'.repeat(10),
    });
  });
});
