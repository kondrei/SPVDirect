import { BadRequestException } from '@nestjs/common';
import type { Repository } from 'typeorm';
import type { AnafConnection } from '../../anaf/anaf-connection.entity.js';
import type { AnafCompanyAccessService } from '../../anaf/services/anaf-company-access.service.js';
import type { AnafCompanyLookupService } from './anaf-company-lookup.service.js';
import { CompaniesService } from './companies.service.js';
import type { Company } from '../company.entity.js';
import type { ActivityLogsService } from '../../api-logs/activity-logs.service.js';
import { ActivityAction } from '../../api-logs/dto/api-log.enums.js';
import { fakeActivityLogs } from '../../testing/activity-logs.js';
import { AnafConnectionRepository } from '../../anaf/repositories/anaf-connection.repository.js';
import { CompanyRepository } from '../repositories/company.repository.js';

function setup({
  current = null,
  known = true,
  assertAccess = () => Promise.resolve(),
}: {
  current?: number | null;
  known?: boolean;
  assertAccess?: () => Promise<void>;
} = {}) {
  const companies = {
    findOneBy: vi.fn().mockResolvedValue({
      id: 6,
      accountantId: 2,
      cui: '12345678',
      anafConnectionId: current,
    }),
    save: vi.fn((c: unknown) => Promise.resolve(c)),
  };
  const connections = { existsBy: vi.fn().mockResolvedValue(known) };
  const access = { assertAccess: vi.fn(assertAccess) };
  const activity = fakeActivityLogs();
  const service = new CompaniesService(
    new CompanyRepository(companies as unknown as Repository<Company>),
    new AnafConnectionRepository(
      connections as unknown as Repository<AnafConnection>,
    ),
    {} as AnafCompanyLookupService,
    access as unknown as AnafCompanyAccessService,
    activity as unknown as ActivityLogsService,
  );
  return { service, companies, connections, access, activity };
}

describe('CompaniesService.update certificate link', () => {
  it('checks at ANAF that the certificate has SPV rights for the company before linking', async () => {
    const { service, access, connections } = setup();
    const company = await service.update(2, 6, { anafConnectionId: 7 });
    expect(connections.existsBy).toHaveBeenCalledWith({
      id: 7,
      accountantId: 2,
    });
    expect(access.assertAccess).toHaveBeenCalledWith(2, 7, '12345678', 6);
    expect(company.anafConnectionId).toBe(7);
  });

  it('does not save the link when ANAF refuses the certificate', async () => {
    const refused = new BadRequestException('fără drept');
    const { service, companies } = setup({
      assertAccess: () => Promise.reject(refused),
    });
    await expect(service.update(2, 6, { anafConnectionId: 7 })).rejects.toBe(
      refused,
    );
    expect(companies.save).not.toHaveBeenCalled();
  });

  it('rejects a certificate of another accountant without asking ANAF', async () => {
    const { service, access } = setup({ known: false });
    await expect(service.update(2, 6, { anafConnectionId: 8 })).rejects.toEqual(
      new BadRequestException('Certificat ANAF necunoscut'),
    );
    expect(access.assertAccess).not.toHaveBeenCalled();
  });

  it('does not ask ANAF again when the certificate stays the same', async () => {
    const { service, access, connections } = setup({ current: 7 });
    await service.update(2, 6, { anafConnectionId: 7, phone: '0700' });
    expect(connections.existsBy).not.toHaveBeenCalled();
    expect(access.assertAccess).not.toHaveBeenCalled();
  });

  it('unlinks without asking ANAF', async () => {
    const { service, access } = setup({ current: 7 });
    const company = await service.update(2, 6, { anafConnectionId: null });
    expect(access.assertAccess).not.toHaveBeenCalled();
    expect(company.anafConnectionId).toBeNull();
  });

  it('logs the fields that really changed', async () => {
    const { service, activity } = setup({ current: 7 });
    await service.update(2, 6, { anafConnectionId: null, phone: '0700' });
    expect(activity.record).toHaveBeenCalledWith(
      2,
      expect.objectContaining({
        action: ActivityAction.CompanyUpdated,
        companyId: 6,
        details: expect.objectContaining({
          fields: ['phone', 'anafConnectionId'],
        }),
      }),
    );
  });

  it('logs nothing when the update changes nothing', async () => {
    const { service, activity } = setup({ current: 7 });
    await service.update(2, 6, { anafConnectionId: 7 });
    expect(activity.record).not.toHaveBeenCalled();
  });
});
