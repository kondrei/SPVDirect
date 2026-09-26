import { ConfigService } from '@nestjs/config';
import type { Repository } from 'typeorm';
import type { CompaniesService } from '../../companies/companies.service.js';
import type { AuthorizationLink } from './authorization-link.entity.js';
import {
  AuthorizationLinksService,
  hashLinkToken,
} from './authorization-links.service.js';

function setup(link: Partial<AuthorizationLink> | null) {
  const repo = {
    findOneBy: vi.fn().mockResolvedValue(link),
    create: (x: object) => x,
    save: vi.fn((x: object) =>
      Promise.resolve({ id: 'link-1', ...x } as AuthorizationLink),
    ),
    update: vi.fn().mockResolvedValue({ affected: 0 }),
  };
  const companies = {
    get: vi.fn().mockResolvedValue({ id: 7, name: 'Firma SRL' }),
  } as unknown as CompaniesService;
  const service = new AuthorizationLinksService(
    new ConfigService({ API_URL: 'https://api.spvdirect.ro' }),
    companies,
    repo as unknown as Repository<AuthorizationLink>,
  );
  return { service, repo };
}

const future = () => new Date(Date.now() + 3600 * 1000);

describe('AuthorizationLinksService', () => {
  it('creates a link whose token is stored only as a hash', async () => {
    const { service, repo } = setup(null);
    const { url } = await service.create(1, 7);
    const token = url.split('/').pop()!;
    expect(url).toMatch(/^https:\/\/api\.spvdirect\.ro\/anaf\/authorize\//);
    const saved = repo.save.mock.calls[0][0] as AuthorizationLink;
    expect(saved.tokenHash).toBe(hashLinkToken(token));
    expect(JSON.stringify(saved)).not.toContain(token);
  });

  it('accepts an unused, unexpired link', async () => {
    const { service } = setup({ id: 'l', usedAt: null, expiresAt: future() });
    await expect(service.findByToken('t')).resolves.toMatchObject({ ok: true });
  });

  it('rejects a used link', async () => {
    const { service } = setup({
      id: 'l',
      usedAt: new Date(),
      expiresAt: future(),
    });
    await expect(service.findByToken('t')).resolves.toEqual({
      ok: false,
      reason: 'used',
    });
  });

  it('rejects an expired link', async () => {
    const { service } = setup({
      id: 'l',
      usedAt: null,
      expiresAt: new Date(Date.now() - 1000),
    });
    await expect(service.findByToken('t')).resolves.toEqual({
      ok: false,
      reason: 'expired',
    });
  });

  it('markUsed reports a lost race', async () => {
    const { service } = setup(null);
    await expect(service.markUsed('l', 'c')).resolves.toBe(false);
  });
});
