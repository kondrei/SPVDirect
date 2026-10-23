import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  IsNull,
  LessThan,
  MoreThan,
  Repository,
  type EntityManager,
} from 'typeorm';
import { Accountant } from '../accountant.entity.js';
import { AccountStatus } from '../dto/accountant.enums.js';
import type { PendingAccountantData } from '../dto/accountant.types.js';

@Injectable()
export class AccountantRepository {
  constructor(
    @InjectRepository(Accountant)
    private readonly accountantRepository: Repository<Accountant>,
  ) {}

  findById(id: number): Promise<Accountant | null> {
    return this.accountantRepository.findOneBy({ id });
  }

  findSessionState(
    id: number,
  ): Promise<Pick<Accountant, 'status' | 'passwordChangedAt'> | null> {
    return this.accountantRepository.findOne({
      where: { id },
      select: { id: true, status: true, passwordChangedAt: true },
    });
  }

  findByEmailWithPassword(email: string): Promise<Accountant | null> {
    return this.accountantRepository
      .createQueryBuilder('a')
      .addSelect('a.passwordHash')
      .where('a.email = :email', { email })
      .getOne();
  }

  findWithPassword(id: number): Promise<Accountant | null> {
    return this.accountantRepository
      .createQueryBuilder('a')
      .addSelect('a.passwordHash')
      .where('a.id = :id', { id })
      .getOne();
  }

  save(accountant: Accountant): Promise<Accountant> {
    return this.accountantRepository.save(accountant);
  }

  async updatePassword(
    id: number,
    passwordHash: string,
    passwordChangedAt: Date,
  ): Promise<void> {
    await this.accountantRepository.update(
      { id },
      { passwordHash, passwordChangedAt },
    );
  }

  countActive(): Promise<number> {
    return this.accountantRepository.countBy({ status: AccountStatus.Active });
  }

  findPending(
    approvalTokenHash: string,
  ): Promise<Pick<Accountant, 'id' | 'email' | 'name' | 'createdAt'> | null> {
    return this.accountantRepository.findOne({
      select: { id: true, email: true, name: true, createdAt: true },
      where: { approvalTokenHash, status: AccountStatus.Pending },
    });
  }

  async approve(id: number, approvalTokenHash: string): Promise<boolean> {
    const result = await this.accountantRepository.update(
      { id, approvalTokenHash, status: AccountStatus.Pending },
      { status: AccountStatus.Active, approvalTokenHash: null },
    );
    return Boolean(result.affected);
  }

  async deletePending(
    manager: EntityManager,
    id: number,
    approvalTokenHash: string,
  ): Promise<boolean> {
    const result = await manager.delete(Accountant, {
      id,
      approvalTokenHash,
      status: AccountStatus.Pending,
    });
    return Boolean(result.affected);
  }

  existsByEmail(manager: EntityManager, email: string): Promise<boolean> {
    return manager.existsBy(Accountant, { email });
  }

  insertPending(
    manager: EntityManager,
    data: PendingAccountantData,
  ): Promise<Accountant> {
    return manager.save(
      manager.create(Accountant, { ...data, status: AccountStatus.Pending }),
    );
  }

  findUnnotifiedPending(
    id: number,
  ): Promise<Pick<
    Accountant,
    'id' | 'email' | 'name' | 'approvalTokenHash'
  > | null> {
    return this.accountantRepository.findOne({
      select: { id: true, email: true, name: true, approvalTokenHash: true },
      where: this.unnotified(id),
    });
  }

  async swapApprovalToken(
    id: number,
    currentHash: string,
    nextHash: string,
  ): Promise<boolean> {
    const result = await this.accountantRepository.update(
      { ...this.unnotified(id), approvalTokenHash: currentHash },
      { approvalTokenHash: nextHash },
    );
    return Boolean(result.affected);
  }

  async markAdminNotified(id: number): Promise<void> {
    await this.accountantRepository.update(
      { id },
      { adminNotifiedAt: new Date() },
    );
  }

  dueForAdminRetry(
    createdBefore: Date,
    take: number,
  ): Promise<Pick<Accountant, 'id'>[]> {
    return this.accountantRepository.find({
      select: { id: true },
      where: {
        status: AccountStatus.Pending,
        adminNotifiedAt: IsNull(),
        createdAt: LessThan(createdBefore),
      },
      order: { id: 'ASC' },
      take,
    });
  }

  async markDeleted(manager: EntityManager, id: number): Promise<void> {
    await manager.update(Accountant, { id }, { status: AccountStatus.Deleted });
    await manager.softDelete(Accountant, { id });
  }

  deletedBefore(
    cutoff: Date,
    afterId: number,
    take: number,
  ): Promise<Pick<Accountant, 'id'>[]> {
    return this.accountantRepository.find({
      select: { id: true },
      where: { id: MoreThan(afterId), deletedAt: LessThan(cutoff) },
      withDeleted: true,
      order: { id: 'ASC' },
      take,
    });
  }

  async delete(id: number): Promise<void> {
    await this.accountantRepository.delete({ id });
  }

  private unnotified(id: number) {
    return {
      id,
      status: AccountStatus.Pending,
      adminNotifiedAt: IsNull(),
    };
  }
}
