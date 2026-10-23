import { GUARDS_METADATA } from '@nestjs/common/constants.js';
import type { Response } from 'express';
import { ParseIdPipe } from '../../common/parse-id.pipe.js';
import { paramPipes } from '../../testing/param-pipes.js';
import { MfaMethod } from '../dto/auth.enums.js';
import { AccountantParamGuard } from '../guards/accountant-param.guard.js';
import { JwtAuthGuard } from '../guards/jwt-auth.guard.js';
import type { MfaService } from '../services/mfa.service.js';
import type { SessionCookieService } from '../services/session-cookie.service.js';
import { MfaController } from './mfa.controller.js';

function build() {
  const service = {
    status: vi.fn().mockResolvedValue({ enabled: false }),
    startAppSetup: vi.fn().mockResolvedValue({ secret: 'S', otpauthUri: 'U' }),
    confirmAppSetup: vi.fn().mockResolvedValue({ recoveryCode: '04821' }),
    startEmailSetup: vi.fn().mockResolvedValue({ sentTo: 'a***@b.ro' }),
    confirmEmailSetup: vi.fn().mockResolvedValue({ recoveryCode: null }),
    regenerateRecoveryCode: vi
      .fn()
      .mockResolvedValue({ recoveryCode: '11111' }),
    disable: vi.fn().mockResolvedValue(undefined),
  };
  const cookies = { issue: vi.fn().mockResolvedValue(undefined) };
  const controller = new MfaController(
    service as unknown as MfaService,
    cookies as unknown as SessionCookieService,
  );
  return { controller, service, cookies };
}

const res = {} as Response;

describe('MfaController', () => {
  it('requires a session for the URL accountant', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, MfaController)).toEqual([
      JwtAuthGuard,
      AccountantParamGuard,
    ]);
  });

  it.each([
    'status',
    'startAppSetup',
    'confirmAppSetup',
    'startEmailSetup',
    'confirmEmailSetup',
    'regenerateRecoveryCode',
    'disableApp',
    'disableEmail',
    'disable',
  ])('parses the accountant id of %s with ParseIdPipe', (method) => {
    expect(paramPipes(MfaController, method, 'accountantId')).toContain(
      ParseIdPipe,
    );
  });

  it('starts both setups with the password and does not touch the session', async () => {
    const { controller, service, cookies } = build();
    await expect(
      controller.startAppSetup(7, { password: 'p' }),
    ).resolves.toEqual({ secret: 'S', otpauthUri: 'U' });
    await expect(
      controller.startEmailSetup(7, { password: 'p' }),
    ).resolves.toEqual({ sentTo: 'a***@b.ro' });
    expect(service.startAppSetup).toHaveBeenCalledWith(7, 'p');
    expect(service.startEmailSetup).toHaveBeenCalledWith(7, 'p');
    expect(cookies.issue).not.toHaveBeenCalled();
  });

  it('re-issues the current session after each MFA change, so only other sessions end', async () => {
    const { controller, service, cookies } = build();
    await expect(
      controller.confirmAppSetup(7, { code: '123456' }, res),
    ).resolves.toEqual({ recoveryCode: '04821' });
    await expect(
      controller.confirmEmailSetup(7, { code: '654321' }, res),
    ).resolves.toEqual({ recoveryCode: null });
    await expect(
      controller.regenerateRecoveryCode(7, { password: 'p' }, res),
    ).resolves.toEqual({ recoveryCode: '11111' });
    await controller.disableApp(7, { password: 'p' }, res);
    await controller.disableEmail(7, { password: 'p' }, res);
    await controller.disable(7, { password: 'p' }, res);
    expect(service.confirmAppSetup).toHaveBeenCalledWith(7, '123456');
    expect(service.confirmEmailSetup).toHaveBeenCalledWith(7, '654321');
    expect(service.disable.mock.calls).toEqual([
      [7, 'p', MfaMethod.App],
      [7, 'p', MfaMethod.Email],
      [7, 'p', null],
    ]);
    expect(cookies.issue).toHaveBeenCalledTimes(6);
    expect(cookies.issue).toHaveBeenCalledWith(res, 7);
  });

  it('does not re-issue the session when the change fails', async () => {
    const { controller, service, cookies } = build();
    service.disable.mockRejectedValue(new Error('wrong password'));
    await expect(
      controller.disableApp(7, { password: 'p' }, res),
    ).rejects.toThrow();
    expect(cookies.issue).not.toHaveBeenCalled();
  });
});
