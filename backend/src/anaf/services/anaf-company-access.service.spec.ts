import {
  BadGatewayException,
  BadRequestException,
  HttpException,
  HttpStatus,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { AnafApiService } from './anaf-api.service.js';
import {
  AnafCompanyAccessService,
  noSpvRight,
} from './anaf-company-access.service.js';

function setup(response: () => Promise<unknown>) {
  const api = {
    request: vi.fn(response),
    envPath: vi.fn((path: string) => `/test${path}`),
  };
  const service = new AnafCompanyAccessService(
    api as unknown as AnafApiService,
  );
  return { service, api };
}

const reply =
  (data: unknown, status = 200) =>
  () =>
    Promise.resolve({ status, data });

describe('AnafCompanyAccessService.assertAccess', () => {
  it('asks ANAF for one day of e-Factura messages for the CUI with that certificate', async () => {
    const { service, api } = setup(reply('{"mesaje":[]}'));
    await service.assertAccess(2, 7, '12345678', 6);
    expect(api.request).toHaveBeenCalledWith(
      expect.objectContaining({
        accountantId: 2,
        connectionId: 7,
        companyId: 6,
        path: '/test/FCTEL/rest/listaMesajeFactura',
        params: { zile: 1, cif: '12345678' },
        allowStatuses: [400],
      }),
    );
  });

  it('accepts a CUI that has messages', async () => {
    const { service } = setup(reply({ mesaje: [{ id: 1 }] }));
    await expect(
      service.assertAccess(2, 7, '12345678'),
    ).resolves.toBeUndefined();
  });

  it('accepts a CUI with no recent messages', async () => {
    const { service } = setup(
      reply(
        '{"eroare":"Nu exista mesaje in ultimele 1 zile","titlu":"Lista Mesaje"}',
      ),
    );
    await expect(
      service.assertAccess(2, 7, '12345678'),
    ).resolves.toBeUndefined();
  });

  it('rejects a CUI the certificate has no SPV right for', async () => {
    const { service } = setup(
      reply(
        '{"eroare":"Nu aveti drept in SPV pentru CIF=12345678","titlu":"Lista Mesaje"}',
      ),
    );
    await expect(service.assertAccess(2, 7, '12345678')).rejects.toEqual(
      new BadRequestException(noSpvRight('12345678')),
    );
  });

  it('turns an ANAF 403 into the same refusal', async () => {
    const { service } = setup(() =>
      Promise.reject(new HttpException('refuzat', HttpStatus.FORBIDDEN)),
    );
    await expect(service.assertAccess(2, 7, '12345678')).rejects.toEqual(
      new BadRequestException(noSpvRight('12345678')),
    );
  });

  it('passes on other ANAF business errors and 400 messages', async () => {
    await expect(
      setup(
        reply({ eroare: 'CIF introdus= aaa nu este un numar' }),
      ).service.assertAccess(2, 7, '12345678'),
    ).rejects.toEqual(
      new BadRequestException('ANAF: CIF introdus= aaa nu este un numar'),
    );
    await expect(
      setup(reply({ message: 'Parametri invalizi' }, 400)).service.assertAccess(
        2,
        7,
        '12345678',
      ),
    ).rejects.toEqual(new BadRequestException('ANAF: Parametri invalizi'));
  });

  it('fails closed on a reply it cannot read', async () => {
    await expect(
      setup(reply('<html>')).service.assertAccess(2, 7, '12345678'),
    ).rejects.toBeInstanceOf(BadGatewayException);
    await expect(
      setup(reply({ titlu: 'Lista' })).service.assertAccess(
        2,
        7,
        '12345678',
      ),
    ).rejects.toBeInstanceOf(BadGatewayException);
  });

  it('lets other gateway errors through', async () => {
    const down = new ServiceUnavailableException('ANAF indisponibil');
    const { service } = setup(() => Promise.reject(down));
    await expect(service.assertAccess(2, 7, '12345678')).rejects.toBe(
      down,
    );
  });
});
