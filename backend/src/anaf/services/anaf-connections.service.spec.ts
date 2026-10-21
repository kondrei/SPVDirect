import type { Repository } from 'typeorm';
import type { ActivityLogsService } from '../../api-logs/activity-logs.service.js';
import { ActivityAction } from '../../api-logs/dto/api-log.enums.js';
import { fakeActivityLogs } from '../../testing/activity-logs.js';
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
    const repo = {
      findOneBy: vi.fn().mockResolvedValue({
        id: 9,
        accountantId: 4,
        label: 'Cabinet',
        certSerial: 'AB12',
      }),
    };
    const activity = fakeActivityLogs();
    const service = new AnafConnectionsService(
      api as unknown as AnafApiService,
      {} as AnafOAuthService,
      repo as unknown as Repository<AnafConnection>,
      activity as unknown as ActivityLogsService,
    );

    const result = await service.test(4, 9);

    expect(repo.findOneBy).toHaveBeenCalledWith({ id: 9, accountantId: 4 });
    expect(activity.record).toHaveBeenCalledWith(
      4,
      expect.objectContaining({
        action: ActivityAction.CertificateTested,
        description:
          'Certificatul ANAF „Cabinet” a fost testat: răspuns HTTP 200',
      }),
    );
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
    const rows = ids.map((id) => ({
      id,
      accountantId: 1,
      label: `Certificat ${id}`,
      certSerial: `S${id}`,
    }));
    const repo = {
      find: vi.fn().mockResolvedValue(rows.map(({ id }) => ({ id }))),
      findOneBy: vi.fn(({ id }: { id: number }) =>
        Promise.resolve(rows.find((r) => r.id === id) ?? null),
      ),
      remove: vi.fn((row: { id?: number }) => {
        delete row.id;
        return Promise.resolve(undefined);
      }),
      save: vi.fn((row: unknown) => Promise.resolve(row)),
    };
    const activity = fakeActivityLogs();
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
      activity as unknown as ActivityLogsService,
    );
    return { service, repo, oauth, pending, activity };
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

  it('does not log the removals made while deleting the account', async () => {
    const { service, oauth, activity } = setup([4]);
    oauth.revokeConnection.mockResolvedValue(true);
    await service.removeAll(1);
    expect(activity.record).not.toHaveBeenCalled();
  });

  it('logs a certificate removed by the accountant with its label and serial', async () => {
    const { service, oauth, activity } = setup([4]);
    oauth.revokeConnection.mockResolvedValue(true);
    await service.remove(1, 4);
    expect(activity.record).toHaveBeenCalledWith(1, {
      action: ActivityAction.CertificateRemoved,
      description:
        'Certificatul ANAF „Certificat 4” (S4) a fost deconectat și revocat',
      details: { connectionId: 4, label: 'Certificat 4', certSerial: 'S4' },
    });
  });

  it('logs nothing when the certificate is not the accountant’s', async () => {
    const { service, activity } = setup([4]);
    await expect(service.remove(1, 99)).rejects.toThrow(
      'Conexiune ANAF inexistentă',
    );
    expect(activity.record).not.toHaveBeenCalled();
  });

  it('logs a renamed certificate with its new label', async () => {
    const { service, activity } = setup([4]);
    await service.rename(1, 4, 'Firma X');
    expect(activity.record).toHaveBeenCalledWith(
      1,
      expect.objectContaining({
        action: ActivityAction.CertificateRenamed,
        description: 'Certificatul ANAF S4 a fost redenumit „Firma X”',
      }),
    );
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
