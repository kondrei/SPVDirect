import type { CompaniesService } from '../../companies/services/companies.service.js';
import type { AuthorizationLinksService } from '../authorization-links/authorization-links.service.js';
import { AnafAuthorizationService } from './anaf-authorization.service.js';
import type { AnafOAuthService } from './anaf-oauth.service.js';
import type { AnafTokenClient } from './anaf-token-client.service.js';
import {
  AnafConnectionSource,
  AuthorizationOutcomeKind,
  LinkFailure,
} from '../dto/anaf.enums.js';
import type { ActivityLogsService } from '../../api-logs/activity-logs.service.js';
import { ActivityAction } from '../../api-logs/dto/api-log.enums.js';
import { fakeActivityLogs } from '../../testing/activity-logs.js';

const TOKENS = { accessToken: 'a', refreshToken: 'r', serial: 's' };

function setup({ claimed = true, linkOk = true } = {}) {
  const calls: string[] = [];
  const tokens = {
    exchangeCode: vi.fn(() => {
      calls.push('exchange');
      return Promise.resolve(TOKENS);
    }),
  };
  const oauth = {
    saveConnection: vi.fn(() => {
      calls.push('save');
      return Promise.resolve({ id: 7 });
    }),
  };
  const links = {
    findById: vi.fn().mockResolvedValue(
      linkOk
        ? {
            ok: true,
            link: { id: 3, accountantId: 3 },
            company: { id: 7, name: 'Firma SRL' },
          }
        : { ok: false, reason: LinkFailure.Expired },
    ),
    claim: vi.fn(() => {
      calls.push('claim');
      return Promise.resolve(claimed);
    }),
    attachConnection: vi.fn().mockResolvedValue(undefined),
    release: vi.fn().mockResolvedValue(undefined),
  };
  const companies = { attachConnection: vi.fn().mockResolvedValue(undefined) };
  const activity = fakeActivityLogs();
  const service = new AnafAuthorizationService(
    tokens as unknown as AnafTokenClient,
    oauth as unknown as AnafOAuthService,
    links as unknown as AuthorizationLinksService,
    companies as unknown as CompaniesService,
    activity as unknown as ActivityLogsService,
  );
  return { service, oauth, links, companies, calls, activity };
}

describe('AnafAuthorizationService.complete activity', () => {
  it('logs the accountant’s own certificate', async () => {
    const { service, activity, oauth } = setup();
    oauth.saveConnection.mockResolvedValue({
      id: 7,
      label: 'Token',
      certSerial: 'AB12',
    } as never);
    await service.complete(
      { state: 's', mode: AnafConnectionSource.Self, accountantId: 5 },
      'code',
    );
    expect(activity.record).toHaveBeenCalledWith(5, {
      action: ActivityAction.CertificateConnected,
      companyId: null,
      description: 'Certificatul ANAF AB12 a fost conectat',
      details: { connectionId: 7, label: 'Token', certSerial: 'AB12' },
    });
  });

  it('logs a link authorization for the link owner and the company', async () => {
    const { service, activity } = setup();
    await service.complete(
      { state: 's', mode: AnafConnectionSource.Link, linkId: 3 },
      'code',
    );
    expect(activity.record).toHaveBeenCalledWith(
      3,
      expect.objectContaining({
        action: ActivityAction.CertificateConnected,
        companyId: 7,
      }),
    );
  });
});

describe('AnafAuthorizationService.complete', () => {
  it('saves the accountant’s own certificate', async () => {
    const { service, oauth } = setup();
    await expect(
      service.complete(
        { state: 's', mode: AnafConnectionSource.Self, accountantId: 5 },
        'code',
      ),
    ).resolves.toEqual({
      kind: AuthorizationOutcomeKind.Self,
      accountantId: 5,
    });
    expect(oauth.saveConnection).toHaveBeenCalledWith(
      5,
      TOKENS,
      AnafConnectionSource.Self,
    );
  });

  it('claims the link before storing any token', async () => {
    const { service, calls, links, companies } = setup();
    await expect(
      service.complete(
        { state: 's', mode: AnafConnectionSource.Link, linkId: 3 },
        'code',
      ),
    ).resolves.toEqual({
      kind: AuthorizationOutcomeKind.Link,
      companyName: 'Firma SRL',
    });
    expect(calls).toEqual(['exchange', 'claim', 'save']);
    expect(links.attachConnection).toHaveBeenCalledWith(3, 7);
    expect(companies.attachConnection).toHaveBeenCalledWith(7, 7);
  });

  it('stores nothing when another holder used the link first', async () => {
    const { service, oauth } = setup({ claimed: false });
    await expect(
      service.complete(
        { state: 's', mode: AnafConnectionSource.Link, linkId: 3 },
        'code',
      ),
    ).resolves.toEqual({
      kind: AuthorizationOutcomeKind.LinkInvalid,
      reason: LinkFailure.Used,
    });
    expect(oauth.saveConnection).not.toHaveBeenCalled();
  });

  it('releases the link when the tokens cannot be stored', async () => {
    const { service, oauth, links } = setup();
    oauth.saveConnection.mockRejectedValueOnce(new Error('no serial'));
    await expect(
      service.complete(
        { state: 's', mode: AnafConnectionSource.Link, linkId: 3 },
        'code',
      ),
    ).rejects.toThrow('no serial');
    expect(links.release).toHaveBeenCalledWith(3);
    expect(links.attachConnection).not.toHaveBeenCalled();
  });

  it('reports an expired link without claiming it', async () => {
    const { service, links } = setup({ linkOk: false });
    await expect(
      service.complete(
        { state: 's', mode: AnafConnectionSource.Link, linkId: 3 },
        'code',
      ),
    ).resolves.toEqual({
      kind: AuthorizationOutcomeKind.LinkInvalid,
      reason: LinkFailure.Expired,
    });
    expect(links.claim).not.toHaveBeenCalled();
  });
});
