import type { Brackets, Repository, WhereExpressionBuilder } from 'typeorm';
import type { SpvMessage } from '../../anaf/spv/spv-message.entity.js';
import { companySpvMessages } from './company-records.js';

describe('companySpvMessages', () => {
  it("selects the accountant's messages linked to the company or matching its CUI", () => {
    const builder = {
      where: vi.fn().mockReturnThis(),
      andWhere: vi.fn().mockReturnThis(),
    };
    const repo = { createQueryBuilder: vi.fn().mockReturnValue(builder) };
    companySpvMessages(repo as unknown as Repository<SpvMessage>, {
      id: 7,
      accountantId: 1,
      cui: '123',
    });

    expect(repo.createQueryBuilder).toHaveBeenCalledWith('m');
    expect(builder.where).toHaveBeenCalledWith(
      'm.accountantId = :accountantId',
      { accountantId: 1 },
    );

    const brackets = builder.andWhere.mock.calls[0][0] as Brackets;
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
  });
});
