import type { Repository } from 'typeorm';
import type { AnafConnection } from '../anaf-connection.entity.js';
import { redactBearerTokens } from '../redact-bearer.js';
import type { AnafApiService } from './anaf-api.service.js';
import { AnafConnectionsService } from './anaf-connections.service.js';
import type { AnafOAuthService } from './anaf-oauth.service.js';

const HELLO =
  'Hello, SPVDirect headers=key=Accept val=[application/json] ' +
  'key=Authorization val=[Bearer eyJhbGciOi.eyJzdWIi.c2lnbmF0dXJl] ' +
  'key=role val=[HELLO] key=serial_certificate val=[2621742f033c0099b8303a0e]';

describe('redactBearerTokens', () => {
  it('hides the token ANAF echoes back and keeps the other headers', () => {
    const out = redactBearerTokens(HELLO);
    expect(out).not.toContain('eyJ');
    expect(out).toContain('key=Authorization val=[Bearer [ascuns]]');
    expect(out).toContain(
      'key=serial_certificate val=[2621742f033c0099b8303a0e]',
    );
  });

  it('hides every token, whatever the case or separator', () => {
    expect(redactBearerTokens('bearer abc.def, BEARER xyz')).toBe(
      'Bearer [ascuns], Bearer [ascuns]',
    );
  });

  it('leaves text without a token unchanged', () => {
    expect(redactBearerTokens('Hello, SPVDirect')).toBe('Hello, SPVDirect');
  });
});

describe('AnafConnectionsService.test', () => {
  it('returns the TestOAuth reply without the access token', async () => {
    const api = {
      request: vi.fn().mockResolvedValue({ status: 200, data: HELLO }),
    };
    const service = new AnafConnectionsService(
      api as unknown as AnafApiService,
      {} as AnafOAuthService,
      {} as Repository<AnafConnection>,
    );

    const result = await service.test(4, 9);

    expect(api.request).toHaveBeenCalledWith(
      expect.objectContaining({
        accountantId: 4,
        connectionId: 9,
        path: '/TestOauth/jaxrs/hello',
      }),
    );
    expect(result.status).toBe(200);
    expect(result.body).not.toContain('eyJ');
    expect(result.body).toContain('Bearer [ascuns]');
  });
});

describe('AnafConnectionsService.removeAll', () => {
  function setup(ids: number[]) {
    const rows = ids.map((id) => ({ id, accountantId: 1 }));
    const repo = {
      find: vi.fn().mockResolvedValue(rows.map(({ id }) => ({ id }))),
      findOneBy: vi.fn(({ id }: { id: number }) =>
        Promise.resolve(rows.find((r) => r.id === id) ?? null),
      ),
      remove: vi.fn().mockResolvedValue(undefined),
    };
    const pending: (() => void)[] = [];
    const oauth = {
      revokeConnection: vi.fn(
        () =>
          new Promise<boolean>((resolve) => {
            pending.push(() => resolve(true));
          }),
      ),
    };
    const service = new AnafConnectionsService(
      {} as AnafApiService,
      oauth as unknown as AnafOAuthService,
      repo as unknown as Repository<AnafConnection>,
    );
    return { service, repo, oauth, pending };
  }

  it('revokes every certificate of the account in parallel, then removes them', async () => {
    const { service, repo, oauth, pending } = setup([4, 5]);
    const done = service.removeAll(1);
    await vi.waitFor(() =>
      expect(oauth.revokeConnection).toHaveBeenCalledTimes(2),
    );
    pending.forEach((release) => release());
    await expect(done).resolves.toEqual([]);
    expect(repo.find).toHaveBeenCalledWith(
      expect.objectContaining({ where: { accountantId: 1 } }),
    );
    expect(repo.remove).toHaveBeenCalledTimes(2);
  });

  it('keeps going when one certificate fails and reports which one', async () => {
    const { service, repo, oauth } = setup([4, 5]);
    oauth.revokeConnection.mockResolvedValue(true);
    repo.remove
      .mockRejectedValueOnce(new Error('db down'))
      .mockResolvedValueOnce(undefined);
    await expect(service.removeAll(1)).resolves.toEqual([4]);
    expect(repo.remove).toHaveBeenCalledTimes(2);
  });

  it('does nothing for an account without certificates', async () => {
    const { service, oauth } = setup([]);
    await expect(service.removeAll(1)).resolves.toEqual([]);
    expect(oauth.revokeConnection).not.toHaveBeenCalled();
  });
});
