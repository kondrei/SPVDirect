import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThan, Repository } from 'typeorm';
import { AnafConnection } from '../anaf-connection.entity.js';
import { AnafConnectionStatus } from '../dto/anaf.enums.js';
import type { AnafConnectionChanges } from '../dto/anaf.types.js';

@Injectable()
export class AnafConnectionRepository {
  constructor(
    @InjectRepository(AnafConnection)
    private readonly anafConnectionRepository: Repository<AnafConnection>,
  ) {}

  create(data: Partial<AnafConnection>): AnafConnection {
    return this.anafConnectionRepository.create(data);
  }

  save(connection: AnafConnection): Promise<AnafConnection> {
    return this.anafConnectionRepository.save(connection);
  }

  async remove(connection: AnafConnection): Promise<void> {
    await this.anafConnectionRepository.remove(connection);
  }

  async update(id: number, changes: AnafConnectionChanges): Promise<void> {
    await this.anafConnectionRepository.update(id, changes);
  }

  findOwned(accountantId: number, id: number): Promise<AnafConnection | null> {
    return this.anafConnectionRepository.findOneBy({ id, accountantId });
  }

  existsOwned(accountantId: number, id: number): Promise<boolean> {
    return this.anafConnectionRepository.existsBy({ id, accountantId });
  }

  findBySerial(
    accountantId: number,
    certSerial: string,
  ): Promise<AnafConnection | null> {
    return this.anafConnectionRepository.findOneBy({
      accountantId,
      certSerial,
    });
  }

  findDenialState(
    accountantId: number,
    id: number,
  ): Promise<AnafConnection | null> {
    return this.anafConnectionRepository.findOne({
      select: { id: true, deniedWithFreshTokenAt: true },
      where: { id, accountantId },
    });
  }

  findWithTokens(id: number): Promise<AnafConnection | null> {
    return this.anafConnectionRepository
      .createQueryBuilder('c')
      .addSelect(['c.accessTokenEnc', 'c.refreshTokenEnc'])
      .where('c.id = :id', { id })
      .getOne();
  }

  listNewestFirst(accountantId: number): Promise<AnafConnection[]> {
    return this.anafConnectionRepository.find({
      where: { accountantId },
      order: { createdAt: 'DESC' },
    });
  }

  listInOrder(accountantId: number): Promise<AnafConnection[]> {
    return this.anafConnectionRepository.find({
      where: { accountantId },
      order: { id: 'ASC' },
    });
  }

  idsOf(accountantId: number): Promise<Pick<AnafConnection, 'id'>[]> {
    return this.anafConnectionRepository.find({
      select: { id: true },
      where: { accountantId },
    });
  }

  listActive(
    now: Date,
  ): Promise<Pick<AnafConnection, 'id' | 'accountantId'>[]> {
    return this.anafConnectionRepository.find({
      select: { id: true, accountantId: true },
      where: {
        status: AnafConnectionStatus.Active,
        refreshExpiresAt: MoreThan(now),
      },
      order: { id: 'ASC' },
    });
  }

  count(): Promise<number> {
    return this.anafConnectionRepository.count();
  }

  async claimRefresh(
    id: number,
    now: number,
    cooldownMs: number,
    leaseMs: number,
  ): Promise<boolean> {
    const result = await this.anafConnectionRepository
      .createQueryBuilder()
      .update(AnafConnection)
      .set({ tokenCallAt: new Date(now), refreshStartedAt: new Date(now) })
      .where('id = :id', { id })
      .andWhere('status = :active', { active: AnafConnectionStatus.Active })
      .andWhere(
        `COALESCE(GREATEST(token_call_at, last_refreshed_at), '-infinity') <= :cooldownCutoff`,
        { cooldownCutoff: new Date(now - cooldownMs) },
      )
      .andWhere(
        `(refresh_started_at IS NULL OR refresh_started_at <= :leaseCutoff)`,
        { leaseCutoff: new Date(now - leaseMs) },
      )
      .execute();
    return result.affected === 1;
  }
}
