import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository, type EntityManager } from 'typeorm';
import { AuthorizationLink } from '../authorization-link.entity.js';

@Injectable()
export class AuthorizationLinkRepository {
  constructor(
    @InjectRepository(AuthorizationLink)
    private readonly authorizationLinkRepository: Repository<AuthorizationLink>,
  ) {}

  insert(data: Partial<AuthorizationLink>): Promise<AuthorizationLink> {
    return this.authorizationLinkRepository.save(
      this.authorizationLinkRepository.create(data),
    );
  }

  findByTokenHash(tokenHash: string): Promise<AuthorizationLink | null> {
    return this.authorizationLinkRepository.findOneBy({ tokenHash });
  }

  findById(id: number): Promise<AuthorizationLink | null> {
    return this.authorizationLinkRepository.findOneBy({ id });
  }

  async claim(id: number): Promise<boolean> {
    const result = await this.authorizationLinkRepository.update(
      { id, usedAt: IsNull() },
      { usedAt: new Date() },
    );
    return (result.affected ?? 0) > 0;
  }

  async release(id: number): Promise<void> {
    await this.authorizationLinkRepository.update(
      { id, anafConnectionId: IsNull() },
      { usedAt: null },
    );
  }

  async attachConnection(id: number, anafConnectionId: number): Promise<void> {
    await this.authorizationLinkRepository.update({ id }, { anafConnectionId });
  }

  async deleteUnusedOfCompany(
    manager: EntityManager,
    companyId: number,
  ): Promise<void> {
    await manager.delete(AuthorizationLink, { companyId, usedAt: IsNull() });
  }

  async deleteOfAccountant(
    manager: EntityManager,
    accountantId: number,
  ): Promise<void> {
    await manager.delete(AuthorizationLink, { accountantId });
  }
}
