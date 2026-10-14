import type { CompaniesService } from '../../companies/services/companies.service.js';
import type { AuthorizationLinksService } from '../authorization-links/authorization-links.service.js';
import { AnafAuthorizationService } from './anaf-authorization.service.js';
import type { AnafOAuthService } from './anaf-oauth.service.js';
import type { AnafTokenClient } from './anaf-token-client.service.js';

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
      return Promise.resolve({ id: 'conn-1' });
    }),
  };
  const links = {
    findById: vi.fn().mockResolvedValue(
      linkOk
        ? {
            ok: true,
            link: { id: 'link-1', accountantId: 3 },
            company: { id: 7, name: 'Firma SRL' },
          }
        : { ok: false, reason: 'expired' },
    ),
    claim: vi.fn(() => {
      calls.push('claim');
      return Promise.resolve(claimed);
    }),
    attachConnection: vi.fn().mockResolvedValue(undefined),
    release: vi.fn().mockResolvedValue(undefined),
  };
  const companies = { attachConnection: vi.fn().mockResolvedValue(undefined) };
  const service = new AnafAuthorizationService(
    tokens as unknown as AnafTokenClient,
    oauth as unknown as AnafOAuthService,
    links as unknown as AuthorizationLinksService,
    companies as unknown as CompaniesService,
  );
  return { service, oauth, links, companies, calls };
}

describe('AnafAuthorizationService.complete', () => {
  it('saves the accountant’s own certificate', async () => {
    const { service, oauth } = setup();
    await expect(
      service.complete({ state: 's', mode: 'self', accountantId: 5 }, 'code'),
    ).resolves.toEqual({ kind: 'self', accountantId: 5 });
    expect(oauth.saveConnection).toHaveBeenCalledWith(5, TOKENS, 'self');
  });

  it('claims the link before storing any token', async () => {
    const { service, calls, links, companies } = setup();
    await expect(
      service.complete({ state: 's', mode: 'link', linkId: 'link-1' }, 'code'),
    ).resolves.toEqual({ kind: 'link', companyName: 'Firma SRL' });
    expect(calls).toEqual(['exchange', 'claim', 'save']);
    expect(links.attachConnection).toHaveBeenCalledWith('link-1', 'conn-1');
    expect(companies.attachConnection).toHaveBeenCalledWith(7, 'conn-1');
  });

  it('stores nothing when another holder used the link first', async () => {
    const { service, oauth } = setup({ claimed: false });
    await expect(
      service.complete({ state: 's', mode: 'link', linkId: 'link-1' }, 'code'),
    ).resolves.toEqual({ kind: 'link-invalid', reason: 'used' });
    expect(oauth.saveConnection).not.toHaveBeenCalled();
  });

  it('releases the link when the tokens cannot be stored', async () => {
    const { service, oauth, links } = setup();
    oauth.saveConnection.mockRejectedValueOnce(new Error('no serial'));
    await expect(
      service.complete({ state: 's', mode: 'link', linkId: 'link-1' }, 'code'),
    ).rejects.toThrow('no serial');
    expect(links.release).toHaveBeenCalledWith('link-1');
    expect(links.attachConnection).not.toHaveBeenCalled();
  });

  it('reports an expired link without claiming it', async () => {
    const { service, links } = setup({ linkOk: false });
    await expect(
      service.complete({ state: 's', mode: 'link', linkId: 'link-1' }, 'code'),
    ).resolves.toEqual({ kind: 'link-invalid', reason: 'expired' });
    expect(links.claim).not.toHaveBeenCalled();
  });
});
