import { StreamableFile } from '@nestjs/common';
import { Readable } from 'node:stream';
import { ParseIdPipe } from '../../common/parse-id.pipe.js';
import { paramPipes } from '../../testing/param-pipes.js';
import { CompanyDeletionController } from './company-deletion.controller.js';
import type { CompanyDeletionService } from './company-deletion.service.js';
import type { CompanyExportService } from './company-export.service.js';

describe('CompanyDeletionController', () => {
  it.each(['export', 'remove'])(
    'parses the accountant and company ids of %s with ParseIdPipe',
    (method) => {
      expect(
        paramPipes(CompanyDeletionController, method, 'accountantId'),
      ).toContain(ParseIdPipe);
      expect(paramPipes(CompanyDeletionController, method, 'id')).toContain(
        ParseIdPipe,
      );
    },
  );

  it('streams the export as a ZIP attachment', async () => {
    const exports = {
      export: vi.fn().mockResolvedValue({
        content: Readable.from([Buffer.from('zip')]),
        contentType: 'application/zip',
        filename: 'firma-123-export-2026-10-19.zip',
      }),
    };
    const controller = new CompanyDeletionController(
      {} as CompanyDeletionService,
      exports as unknown as CompanyExportService,
    );
    const file = await controller.export(1, 7);
    expect(file).toBeInstanceOf(StreamableFile);
    expect(file.getHeaders()).toMatchObject({
      type: 'application/zip',
      disposition: 'attachment; filename="firma-123-export-2026-10-19.zip"',
    });
    expect(exports.export).toHaveBeenCalledWith(1, 7);
  });

  it('soft-deletes on DELETE', async () => {
    const deletion = { softDelete: vi.fn().mockResolvedValue(undefined) };
    const controller = new CompanyDeletionController(
      deletion as unknown as CompanyDeletionService,
      {} as CompanyExportService,
    );
    await controller.remove(1, 7);
    expect(deletion.softDelete).toHaveBeenCalledWith(1, 7);
  });
});
