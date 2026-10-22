import type { Repository } from 'typeorm';
import { ParseIdPipe } from '../common/parse-id.pipe.js';
import { paramPipes } from '../testing/param-pipes.js';
import { ActivityLogsController } from './activity-logs.controller.js';
import { ActivityLogsService } from './activity-logs.service.js';
import type { ApiLog } from './api-log.entity.js';
import { SYSTEM_ACTOR_NAME } from './dto/api-log.constants.js';
import {
  ActivityAction,
  ApiLogMethod,
  ApiLogService,
  JobActivityAction,
  ScheduledJob,
} from './dto/api-log.enums.js';

function setup(rows: object[] = [], total = rows.length) {
  const qb = {
    leftJoin: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    andWhere: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    addSelect: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    addOrderBy: vi.fn().mockReturnThis(),
    offset: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    getCount: vi.fn().mockResolvedValue(total),
    getRawMany: vi.fn().mockResolvedValue(rows),
  };
  const repo = {
    insert: vi.fn().mockResolvedValue(undefined),
    createQueryBuilder: vi.fn().mockReturnValue(qb),
  };
  const service = new ActivityLogsService(
    repo as unknown as Repository<ApiLog>,
  );
  return { service, repo, qb };
}

const ROW = {
  id: 12,
  action: ActivityAction.CompanyCreated,
  companyId: 7,
  description: 'Firma ALFA SRL (CUI 123) a fost adăugată',
  details: { cui: '123' },
  accountantName: 'Andrei K',
  createdAt: '2026-10-21T08:00:00.000Z',
};

describe('ActivityLogsService.record', () => {
  it('stores the activity in api_logs without the accountant name', async () => {
    const { service, repo } = setup();
    await service.record(1, {
      action: ActivityAction.CompanyCreated,
      companyId: 7,
      description: 'Firma ALFA SRL (CUI 123) a fost adăugată',
      details: { cui: '123' },
    });
    expect(repo.insert).toHaveBeenCalledWith([
      {
        accountantId: 1,
        anafConnectionId: null,
        companyId: 7,
        service: ApiLogService.Activity,
        method: ApiLogMethod.Log,
        endpoint: ActivityAction.CompanyCreated,
        statusCode: null,
        responseTimeMs: null,
        error: null,
        description: 'Firma ALFA SRL (CUI 123) a fost adăugată',
        details: { cui: '123' },
      },
    ]);
  });

  it('stores a scheduled job run without an accountant, with its error', async () => {
    const { service, repo } = setup();
    await service.recordJob({
      action: JobActivityAction.Failed,
      description: 'Sincronizarea SPV a eșuat: down',
      details: { job: ScheduledJob.SpvSync },
      error: 'down',
    });
    expect(repo.insert).toHaveBeenCalledWith([
      {
        accountantId: null,
        anafConnectionId: null,
        companyId: null,
        service: ApiLogService.Activity,
        method: ApiLogMethod.Log,
        endpoint: JobActivityAction.Failed,
        statusCode: null,
        responseTimeMs: null,
        error: 'down',
        description: 'Sincronizarea SPV a eșuat: down',
        details: { job: ScheduledJob.SpvSync },
      },
    ]);
  });

  it('never fails the job when the activity row cannot be written', async () => {
    const { service, repo } = setup();
    repo.insert.mockRejectedValueOnce(new Error('db down'));
    await expect(
      service.recordJob({
        action: JobActivityAction.Completed,
        description: 'x',
        details: { job: ScheduledJob.Purge },
      }),
    ).resolves.toBeUndefined();
  });

  it('defaults to no company and empty details', async () => {
    const { service, repo } = setup();
    await service.record(1, {
      action: ActivityAction.LoggedIn,
      description: 'Autentificare în cont',
    });
    expect(repo.insert).toHaveBeenCalledWith([
      expect.objectContaining({ companyId: null, details: {} }),
    ]);
  });

  it('writes many entries in one insert and skips an empty list', async () => {
    const { service, repo } = setup();
    await service.recordMany(1, []);
    expect(repo.insert).not.toHaveBeenCalled();
    await service.recordMany(1, [
      { action: ActivityAction.CompanyCreated, description: 'a' },
      { action: ActivityAction.CompanyCreated, description: 'b' },
    ]);
    expect(repo.insert).toHaveBeenCalledOnce();
    expect(repo.insert.mock.calls[0][0]).toHaveLength(2);
  });

  it('never fails the operation when the log cannot be written', async () => {
    const { service, repo } = setup();
    repo.insert.mockRejectedValue(new Error('db down'));
    await expect(
      service.record(1, {
        action: ActivityAction.LoggedIn,
        description: 'Autentificare în cont',
      }),
    ).resolves.toBeUndefined();
  });
});

describe('ActivityLogsService.list', () => {
  it('reads only the accountant’s activity rows, newest first, with the name joined from the profile', async () => {
    const { service, qb } = setup([ROW], 41);
    const page = await service.list(1, { page: 3, pageSize: 20 });
    expect(qb.leftJoin).toHaveBeenCalledWith(
      expect.any(Function),
      'a',
      'a.id = l.accountantId',
    );
    expect(qb.where).toHaveBeenCalledWith('l.accountantId = :accountantId', {
      accountantId: 1,
    });
    expect(qb.andWhere).toHaveBeenCalledWith('l.service = :service', {
      service: ApiLogService.Activity,
    });
    expect(qb.addSelect).toHaveBeenCalledWith(
      `COALESCE(NULLIF(TRIM(a.name), ''), a.email::text)`,
      'accountantName',
    );
    expect(qb.orderBy).toHaveBeenCalledWith('l.created_at', 'DESC');
    expect(qb.offset).toHaveBeenCalledWith(40);
    expect(qb.limit).toHaveBeenCalledWith(20);
    expect(page).toEqual({
      items: [{ ...ROW, createdAt: new Date(ROW.createdAt) }],
      total: 41,
      page: 3,
      pageSize: 20,
    });
  });

  it('filters by company and action', async () => {
    const { service, qb } = setup();
    await service.list(1, {
      companyId: 7,
      action: ActivityAction.InvoiceIssued,
      page: 1,
      pageSize: 20,
    });
    expect(qb.andWhere).toHaveBeenCalledWith('l.companyId = :companyId', {
      companyId: 7,
    });
    expect(qb.andWhere).toHaveBeenCalledWith('l.endpoint = :action', {
      action: ActivityAction.InvoiceIssued,
    });
  });

  it('fills missing text and details so the page never sees null', async () => {
    const { service } = setup([
      {
        ...ROW,
        companyId: null,
        description: null,
        details: null,
        accountantName: null,
      },
    ]);
    const [item] = (await service.list(1, { page: 1, pageSize: 20 })).items;
    expect(item).toMatchObject({
      companyId: null,
      description: '',
      details: {},
      accountantName: '',
    });
  });

  it('names the system, not the accountant, on rows a scheduled job wrote', async () => {
    const { service } = setup([
      { ...ROW, details: { job: ScheduledJob.Purge, companies: 2 } },
    ]);
    const [item] = (await service.list(1, { page: 1, pageSize: 20 })).items;
    expect(item.accountantName).toBe(SYSTEM_ACTOR_NAME);
  });
});

describe('ActivityLogsService.all', () => {
  it('returns the whole activity oldest first for the export', async () => {
    const { service, qb } = setup([ROW]);
    expect(await service.all(1)).toHaveLength(1);
    expect(qb.orderBy).toHaveBeenCalledWith('l.created_at', 'ASC');
    expect(qb.offset).not.toHaveBeenCalled();
  });
});

describe('ActivityLogsController', () => {
  it('parses the accountant id with ParseIdPipe', () => {
    expect(
      paramPipes(ActivityLogsController, 'list', 'accountantId'),
    ).toContain(ParseIdPipe);
  });

  it('passes the filters with the default page and page size', async () => {
    const list = vi.fn().mockResolvedValue({ items: [] });
    const controller = new ActivityLogsController({
      list,
    } as unknown as ActivityLogsService);
    await controller.list(1, { companyId: 7 });
    expect(list).toHaveBeenCalledWith(1, {
      companyId: 7,
      action: undefined,
      page: 1,
      pageSize: 20,
    });
  });
});
