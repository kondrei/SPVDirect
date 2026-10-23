import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Brackets,
  In,
  IsNull,
  Not,
  Repository,
  type EntityManager,
  type SelectQueryBuilder,
} from 'typeorm';
import { SpvMessage } from '../spv-message.entity.js';
import type {
  ArchiveFilter,
  CompanyMessagesRef,
  SpvMessageChanges,
  SpvMessageInsert,
} from '../dto/spv.types.js';

@Injectable()
export class SpvMessageRepository {
  constructor(
    @InjectRepository(SpvMessage)
    private readonly spvMessageRepository: Repository<SpvMessage>,
  ) {}

  async update(id: number, changes: SpvMessageChanges): Promise<void> {
    await this.spvMessageRepository.update({ id }, changes);
  }

  findOwned(accountantId: number, id: number): Promise<SpvMessage | null> {
    return this.spvMessageRepository.findOneBy({ id, accountantId });
  }

  findWithContent(
    accountantId: number,
    id: number,
  ): Promise<SpvMessage | null> {
    return this.spvMessageRepository
      .createQueryBuilder('m')
      .addSelect('m.content')
      .where('m.id = :id AND m.accountantId = :accountantId', {
        id,
        accountantId,
      })
      .getOne();
  }

  missingContent(
    accountantId: number,
    anafMessageIds: string[],
    take: number,
  ): Promise<[Pick<SpvMessage, 'id' | 'anafMessageId'>[], number]> {
    return this.spvMessageRepository.findAndCount({
      select: { id: true, anafMessageId: true },
      where: {
        accountantId,
        anafMessageId: In(anafMessageIds),
        sizeBytes: IsNull(),
      },
      order: { anafCreatedAt: 'DESC', id: 'DESC' },
      take,
    });
  }

  page(
    accountantId: number,
    filter: ArchiveFilter,
  ): Promise<[SpvMessage[], number]> {
    const qb = this.spvMessageRepository
      .createQueryBuilder('m')
      .where('m.accountantId = :accountantId', { accountantId });
    if (filter.cif) qb.andWhere('m.cif = :cif', { cif: filter.cif });
    if (filter.type) qb.andWhere('m.type = :type', { type: filter.type });
    if (filter.companyId) {
      qb.andWhere('m.companyId = :companyId', { companyId: filter.companyId });
    }
    return qb
      .orderBy('m.anafCreatedAt', 'DESC', 'NULLS LAST')
      .addOrderBy('m.id', 'DESC')
      .skip((filter.page - 1) * filter.pageSize)
      .take(filter.pageSize)
      .getManyAndCount();
  }

  contentNotInStorage(limit: number): Promise<SpvMessage[]> {
    return this.spvMessageRepository
      .createQueryBuilder('m')
      .addSelect('m.content')
      .where('m.content IS NOT NULL AND m.storagePath IS NULL')
      .orderBy('m.id', 'ASC')
      .take(limit)
      .getMany();
  }

  async insertNew(rows: SpvMessageInsert[]): Promise<number> {
    const result = await this.spvMessageRepository
      .createQueryBuilder()
      .insert()
      .into(SpvMessage)
      .values(rows)
      .orIgnore()
      .returning('id')
      .execute();
    return (result.raw as unknown[]).length;
  }

  count(): Promise<number> {
    return this.spvMessageRepository.count();
  }

  ofCompany(company: CompanyMessagesRef): Promise<SpvMessage[]> {
    return companyMessages(this.spvMessageRepository, company)
      .orderBy('m.anafCreatedAt', 'ASC', 'NULLS LAST')
      .addOrderBy('m.id', 'ASC')
      .getMany();
  }

  unmatched(accountantId: number): Promise<SpvMessage[]> {
    return this.spvMessageRepository.find({
      where: { accountantId, companyId: IsNull() },
      order: { anafCreatedAt: 'ASC', id: 'ASC' },
    });
  }

  async linkUnmatched(
    manager: EntityManager,
    company: CompanyMessagesRef,
  ): Promise<void> {
    const unlinked = await companyMessages(
      manager.getRepository(SpvMessage),
      company,
    )
      .andWhere('m.companyId IS NULL')
      .select('m.id', 'id')
      .getRawMany<{ id: number }>();
    if (unlinked.length) {
      await manager.update(
        SpvMessage,
        { id: In(unlinked.map((m) => m.id)) },
        { companyId: company.id },
      );
    }
  }

  async softDeleteOfCompany(
    manager: EntityManager,
    companyId: number,
  ): Promise<void> {
    await manager.softDelete(SpvMessage, { companyId });
  }

  async softDeleteOfAccountant(
    manager: EntityManager,
    accountantId: number,
  ): Promise<void> {
    await manager.softDelete(SpvMessage, { accountantId });
  }

  async purgeCompany(manager: EntityManager, companyId: number): Promise<void> {
    await manager.delete(SpvMessage, { companyId });
  }

  storedOfCompany(
    companyId: number,
  ): Promise<Pick<SpvMessage, 'id' | 'storagePath'>[]> {
    return this.stored({ companyId });
  }

  storedOfAccountant(
    accountantId: number,
  ): Promise<Pick<SpvMessage, 'id' | 'storagePath'>[]> {
    return this.stored({ accountantId });
  }

  liveWithPaths(
    paths: string[],
  ): Promise<Pick<SpvMessage, 'id' | 'storagePath'>[]> {
    return this.spvMessageRepository.find({
      select: { id: true, storagePath: true },
      where: { storagePath: In(paths) },
    });
  }

  private stored(
    owner: { companyId: number } | { accountantId: number },
  ): Promise<Pick<SpvMessage, 'id' | 'storagePath'>[]> {
    return this.spvMessageRepository.find({
      select: { id: true, storagePath: true },
      where: { ...owner, storagePath: Not(IsNull()) },
      withDeleted: true,
    });
  }
}

function companyMessages(
  messages: Repository<SpvMessage>,
  company: CompanyMessagesRef,
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
