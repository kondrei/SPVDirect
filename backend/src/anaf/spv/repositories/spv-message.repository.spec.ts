import {
  In,
  type Brackets,
  type EntityManager,
  type Repository,
  type WhereExpressionBuilder,
} from 'typeorm';
import { SpvMessage } from '../spv-message.entity.js';
import { SpvMessageRepository } from './spv-message.repository.js';

const COMPANY = { id: 7, accountantId: 1, cui: '123' };

function builder(rows: object[] = []) {
  return {
    where: vi.fn().mockReturnThis(),
    andWhere: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    addOrderBy: vi.fn().mockReturnThis(),
    getMany: vi.fn().mockResolvedValue(rows),
    getRawMany: vi.fn().mockResolvedValue(rows),
  };
}

function expectCompanyFilter(qb: ReturnType<typeof builder>) {
  expect(qb.where).toHaveBeenCalledWith('m.accountantId = :accountantId', {
    accountantId: 1,
  });
  const brackets = qb.andWhere.mock.calls[0][0] as Brackets;
  const inner = {
    where: vi.fn().mockReturnThis(),
    orWhere: vi.fn().mockReturnThis(),
  };
  brackets.whereFactory(inner as unknown as WhereExpressionBuilder);
  expect(inner.where).toHaveBeenCalledWith('m.companyId = :companyId', {
    companyId: 7,
  });
  expect(inner.orWhere).toHaveBeenCalledWith(
    `m.companyId IS NULL AND replace(upper(m.cif), ' ', '') IN (:...cifs)`,
    { cifs: ['123', 'RO123'] },
  );
}

describe('SpvMessageRepository.ofCompany', () => {
  it("selects the accountant's messages linked to the company or matching its CUI", async () => {
    const qb = builder([{ id: 1 }]);
    const repo = { createQueryBuilder: vi.fn().mockReturnValue(qb) };
    const messages = new SpvMessageRepository(
      repo as unknown as Repository<SpvMessage>,
    );

    await expect(messages.ofCompany(COMPANY)).resolves.toEqual([{ id: 1 }]);

    expect(repo.createQueryBuilder).toHaveBeenCalledWith('m');
    expectCompanyFilter(qb);
    expect(qb.orderBy).toHaveBeenCalledWith(
      'm.anafCreatedAt',
      'ASC',
      'NULLS LAST',
    );
  });
});

describe('SpvMessageRepository.linkUnmatched', () => {
  function setup(unlinked: { id: number }[]) {
    const qb = builder(unlinked);
    const manager = {
      getRepository: vi.fn(() => ({
        createQueryBuilder: vi.fn().mockReturnValue(qb),
      })),
      update: vi.fn().mockResolvedValue({}),
    };
    const messages = new SpvMessageRepository({} as Repository<SpvMessage>);
    return { qb, manager, messages };
  }

  it('attaches the messages that match the company only by CIF, in the transaction', async () => {
    const { qb, manager, messages } = setup([{ id: 4 }, { id: 9 }]);
    await messages.linkUnmatched(manager as unknown as EntityManager, COMPANY);
    expect(manager.getRepository).toHaveBeenCalledWith(SpvMessage);
    expectCompanyFilter(qb);
    expect(qb.andWhere).toHaveBeenCalledWith('m.companyId IS NULL');
    expect(manager.update).toHaveBeenCalledWith(
      SpvMessage,
      { id: In([4, 9]) },
      { companyId: 7 },
    );
  });

  it('updates nothing when every message is already linked', async () => {
    const { manager, messages } = setup([]);
    await messages.linkUnmatched(manager as unknown as EntityManager, COMPANY);
    expect(manager.update).not.toHaveBeenCalled();
  });
});

describe('SpvMessageRepository.insertNew', () => {
  it('skips duplicates and counts the rows that were inserted', async () => {
    const qb = {
      insert: vi.fn().mockReturnThis(),
      into: vi.fn().mockReturnThis(),
      values: vi.fn().mockReturnThis(),
      orIgnore: vi.fn().mockReturnThis(),
      returning: vi.fn().mockReturnThis(),
      execute: vi.fn().mockResolvedValue({ raw: [{ id: 1 }, { id: 2 }] }),
    };
    const repo = { createQueryBuilder: vi.fn().mockReturnValue(qb) };
    const messages = new SpvMessageRepository(
      repo as unknown as Repository<SpvMessage>,
    );
    await expect(messages.insertNew([])).resolves.toBe(2);
    expect(qb.into).toHaveBeenCalledWith(SpvMessage);
    expect(qb.orIgnore).toHaveBeenCalled();
  });
});
