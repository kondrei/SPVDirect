import { ANAF_CONNECTION_THROTTLE } from '../../common/constants.js';
import type { AnafConnectionsService } from '../services/anaf-connections.service.js';
import { AnafConnectionsController } from './anaf-connections.controller.js';

const limitOf = (method: keyof AnafConnectionsController): unknown =>
  Reflect.getMetadata(
    'THROTTLER:LIMITdefault',
    AnafConnectionsController.prototype[method],
  );

describe('AnafConnectionsController', () => {
  it.each(['test', 'remove'] as const)(
    'throttles %s, which calls ANAF',
    (method) => {
      expect(limitOf(method)).toBe(ANAF_CONNECTION_THROTTLE.default.limit);
    },
  );

  it('delegates to the service with the URL accountant id', async () => {
    const service = {
      list: vi.fn().mockResolvedValue([]),
      rename: vi.fn().mockResolvedValue({}),
      remove: vi.fn().mockResolvedValue(undefined),
      test: vi.fn().mockResolvedValue({ status: 200, body: 'ok' }),
    };
    const controller = new AnafConnectionsController(
      service as unknown as AnafConnectionsService,
    );
    await controller.list(4);
    await controller.update(4, 'c', { label: 'Nou' });
    await controller.remove(4, 'c');
    await expect(controller.test(4, 'c')).resolves.toEqual({
      status: 200,
      body: 'ok',
    });
    expect(service.list).toHaveBeenCalledWith(4);
    expect(service.rename).toHaveBeenCalledWith(4, 'c', 'Nou');
    expect(service.remove).toHaveBeenCalledWith(4, 'c');
    expect(service.test).toHaveBeenCalledWith(4, 'c');
  });
});
