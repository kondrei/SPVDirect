import 'reflect-metadata';
import { ParseIdPipe } from '../../common/parse-id.pipe.js';
import { paramPipes } from '../../testing/param-pipes.js';
import { EfacturaDirection } from '../dto/efactura.enums.js';
import type { EfacturaArchiveService } from '../services/efactura-archive.service.js';
import { EfacturaArchiveController } from './efactura-archive.controller.js';

function file(contentType: string, filename: string) {
  return { content: Buffer.from('x'), contentType, filename };
}

function setup() {
  const archive = {
    importMessages: vi.fn().mockResolvedValue([]),
    importPeriod: vi
      .fn()
      .mockResolvedValue({ found: 0, remaining: 0, results: [] }),
    list: vi.fn().mockResolvedValue({ items: [] }),
    get: vi.fn().mockResolvedValue({ id: 31 }),
    zip: vi.fn().mockResolvedValue(file('application/zip', 'factura-1.zip')),
    xml: vi.fn().mockResolvedValue(file('application/xml', 'factura-1.xml')),
    pdf: vi.fn().mockResolvedValue(file('application/pdf', 'factura-1.pdf')),
    email: vi.fn().mockResolvedValue({ to: 'a@b.ro', withPdf: true }),
  };
  const controller = new EfacturaArchiveController(
    archive as unknown as EfacturaArchiveService,
  );
  return { controller, archive };
}

describe('EfacturaArchiveController', () => {
  it.each([
    'importMessages',
    'importPeriod',
    'list',
    'get',
    'zip',
    'xml',
    'pdf',
    'email',
  ])('parses the accountant id of %s with ParseIdPipe', (method) => {
    expect(
      paramPipes(EfacturaArchiveController, method, 'accountantId'),
    ).toContain(ParseIdPipe);
  });

  it.each(['importMessages', 'importPeriod'])(
    'parses the company id of %s with ParseIdPipe',
    (method) => {
      expect(
        paramPipes(EfacturaArchiveController, method, 'companyId'),
      ).toContain(ParseIdPipe);
    },
  );

  it.each(['get', 'zip', 'xml', 'pdf', 'email'])(
    'parses the archive id of %s with ParseIdPipe',
    (method) => {
      expect(paramPipes(EfacturaArchiveController, method, 'id')).toContain(
        ParseIdPipe,
      );
    },
  );

  it('imports the chosen messages and a period for the company', async () => {
    const { controller, archive } = setup();
    await controller.importMessages(1, 7, { messageIds: ['3001'] });
    expect(archive.importMessages).toHaveBeenCalledWith(1, 7, ['3001']);
    await controller.importPeriod(1, 7, { zile: 30 });
    expect(archive.importPeriod).toHaveBeenCalledWith(1, 7, 30);
  });

  it('lists with the default page', async () => {
    const { controller, archive } = setup();
    await controller.list(1, { direction: EfacturaDirection.Received });
    expect(archive.list).toHaveBeenCalledWith(1, {
      companyId: undefined,
      direction: 'received',
      from: undefined,
      to: undefined,
      q: undefined,
      page: 1,
      pageSize: 25,
    });
  });

  it('answers the files as attachments', async () => {
    const { controller } = setup();
    const pdf = await controller.pdf(1, 31);
    expect(pdf.getHeaders()).toMatchObject({
      type: 'application/pdf',
      disposition: 'attachment; filename="factura-1.pdf"',
    });
    expect((await controller.zip(1, 31)).getHeaders().type).toBe(
      'application/zip',
    );
    expect((await controller.xml(1, 31)).getHeaders().type).toBe(
      'application/xml',
    );
  });

  it('emails the invoice', async () => {
    const { controller, archive } = setup();
    await controller.email(1, 31, { to: 'a@b.ro', message: 'Salut' });
    expect(archive.email).toHaveBeenCalledWith(1, 31, {
      to: 'a@b.ro',
      message: 'Salut',
    });
  });
});
