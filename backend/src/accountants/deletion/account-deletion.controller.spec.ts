import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import type { Response } from 'express';
import { Readable } from 'node:stream';
import type { SessionCookieService } from '../../auth/services/session-cookie.service.js';
import { ParseIdPipe } from '../../common/parse-id.pipe.js';
import { paramPipes } from '../../testing/param-pipes.js';
import { DeleteAccountDto } from '../dto/profile.dto.js';
import { AccountDeletionController } from './account-deletion.controller.js';
import type { AccountDeletionService } from './account-deletion.service.js';
import type { AccountExportService } from './account-export.service.js';

function setup() {
  const deletion = { softDelete: vi.fn().mockResolvedValue(undefined) };
  const exports = {
    export: vi.fn().mockResolvedValue({
      content: Readable.from([Buffer.from('zip')]),
      contentType: 'application/zip',
      filename: 'cont-spvdirect-export-2026-10-20.zip',
    }),
  };
  const session = { clear: vi.fn() };
  const controller = new AccountDeletionController(
    deletion as unknown as AccountDeletionService,
    exports as unknown as AccountExportService,
    session as unknown as SessionCookieService,
  );
  return { controller, deletion, exports, session };
}

describe('AccountDeletionController', () => {
  it.each(['export', 'remove'])(
    'parses the accountant id of %s with ParseIdPipe',
    (method) => {
      expect(
        paramPipes(AccountDeletionController, method, 'accountantId'),
      ).toContain(ParseIdPipe);
    },
  );

  it('streams the account export as a ZIP attachment', async () => {
    const { controller, exports } = setup();
    const file = await controller.export(1);
    expect(file.getHeaders()).toMatchObject({
      type: 'application/zip',
      disposition:
        'attachment; filename="cont-spvdirect-export-2026-10-20.zip"',
    });
    expect(exports.export).toHaveBeenCalledWith(1);
  });

  it('deletes the account, then clears the session cookie', async () => {
    const { controller, deletion, session } = setup();
    const res = {} as Response;
    await controller.remove(1, { password: 'parola' }, res);
    expect(deletion.softDelete).toHaveBeenCalledWith(1, 'parola');
    expect(session.clear).toHaveBeenCalledWith(res);
  });

  it('keeps the session when the delete is refused', async () => {
    const { controller, deletion, session } = setup();
    deletion.softDelete.mockRejectedValue(new Error('Parola este incorectă'));
    await expect(
      controller.remove(1, { password: 'x' }, {} as Response),
    ).rejects.toThrow('Parola este incorectă');
    expect(session.clear).not.toHaveBeenCalled();
  });

  it('requires a password in the body', async () => {
    const errors = await validate(plainToInstance(DeleteAccountDto, {}));
    expect(errors.map((e) => e.property)).toEqual(['password']);
    expect(
      await validate(plainToInstance(DeleteAccountDto, { password: 'p' })),
    ).toEqual([]);
  });
});
