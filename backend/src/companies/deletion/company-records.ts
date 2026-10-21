import { Brackets, type Repository, type SelectQueryBuilder } from 'typeorm';
import type { SpvMessage } from '../../anaf/spv/spv-message.entity.js';
import type { Company } from '../company.entity.js';

export type CompanyRef = Pick<Company, 'id' | 'accountantId' | 'cui'>;

export function companySpvMessages(
  messages: Repository<SpvMessage>,
  company: CompanyRef,
): SelectQueryBuilder<SpvMessage> {
  return messages
    .createQueryBuilder('m')
    .where('m.accountantId = :accountantId', {
      accountantId: company.accountantId,
    })
    .andWhere(
      new Brackets((qb) =>
        qb
          .where('m.companyId = :companyId', { companyId: company.id })
          .orWhere(
            `m.companyId IS NULL AND replace(upper(m.cif), ' ', '') IN (:...cifs)`,
            { cifs: [company.cui, `RO${company.cui}`] },
          ),
      ),
    );
}
