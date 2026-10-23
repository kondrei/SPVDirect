import { ConfigService } from '@nestjs/config';
import type { Repository } from 'typeorm';
import type { CompaniesService } from '../../companies/services/companies.service.js';
import type { AuthorizationLink } from './authorization-link.entity.js';
import {
  AuthorizationLinksService,
  hashLinkToken,
} from './authorization-links.service.js';
import type { ActivityLogsService } from '../../api-logs/activity-logs.service.js';
import { ActivityAction } from '../../api-logs/dto/api-log.enums.js';
import { fakeActivityLogs } from '../../testing/activity-logs.js';
import { AuthorizationLinkRepository } from './repositories/authorization-link.repository.js';

function setup(link: Partial<AuthorizationLink> | null) {
  const repo = {
    findOneBy: vi.fn().mockResolvedValue(link),
    create: (x: object) => x,
    save: vi.fn((x: object) =>
      Promise.resolve({ id: 3, ...x } as AuthorizationLink),
    ),
    update: vi.fn().mockResolvedValue({ affected: 0 }),
  };
  const companies = {
    get: vi.fn().mockResolvedValue({ id: 7, name: 'Firma SRL' }),
  } as unknown as CompaniesService;
  const activity = fakeActivityLogs();
  const service = new AuthorizationLinksService(
    new ConfigService({ API_URL: 'https://api.spvdirect.ro' }),
    companies,
    new AuthorizationLinkRepository(
      repo as unknown as Repository<AuthorizationLink>,
    ),
    activity as unknown as ActivityLogsService,
  );
  return { service, repo, activity };
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

  it('logs the new link for the company without its token', async () => {
    const { service, activity } = setup(null);
    const { url } = await service.create(1, 7);
    expect(activity.record).toHaveBeenCalledWith(
      1,
      expect.objectContaining({
        action: ActivityAction.AuthorizationLinkCreated,
        companyId: 7,
      }),
    );
    expect(JSON.stringify(activity.record.mock.calls)).not.toContain(
      url.split('/').pop(),
    );
  });

  it('accepts an unused, unexpired link', async () => {
    const { service } = setup({ id: 3, usedAt: null, expiresAt: future() });
    await expect(service.findByToken('t')).resolves.toMatchObject({ ok: true });
  });

  it('rejects a used link', async () => {
    const { service } = setup({
      id: 3,
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
      id: 3,
      usedAt: null,
      expiresAt: new Date(Date.now() - 1000),
    });
    await expect(service.findByToken('t')).resolves.toEqual({
      ok: false,
      reason: 'expired',
    });
  });

  it('claim reports a lost race', async () => {
    const { service } = setup(null);
    await expect(service.claim(3)).resolves.toBe(false);
  });

  it('claims only a link that is still unused', async () => {
    const { service, repo } = setup(null);
    repo.update.mockResolvedValue({ affected: 1 });
    await expect(service.claim(3)).resolves.toBe(true);
    expect(repo.update).toHaveBeenCalledWith(
      { id: 3, usedAt: expect.anything() },
      { usedAt: expect.any(Date) },
    );
  });
});
