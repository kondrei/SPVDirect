import { Injectable } from '@nestjs/common';
import { EventBus } from '@nestjs/cqrs';
import { InjectDataSource } from '@nestjs/typeorm';
import { createHash } from 'node:crypto';
import type { DataSource } from 'typeorm';
import type { PendingRegistration } from '../../dto/auth.types.js';
import { AccountantRepository } from '../../../accountants/repositories/accountant.repository.js';
import { BannedEmailRepository } from '../../repositories/banned-email.repository.js';
import { AccountantApprovedEvent } from '../registration.events.js';

export function hashApprovalToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

@Injectable()
export class RegistrationsService {
  constructor(
    private readonly eventBus: EventBus,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly accountantRepository: AccountantRepository,
    private readonly bannedEmailRepository: BannedEmailRepository,
  ) {}

  async findPending(token: string): Promise<PendingRegistration | null> {
    return this.accountantRepository.findPending(hashApprovalToken(token));
  }

  async approve(token: string): Promise<PendingRegistration | null> {
    const pending = await this.findPending(token);
    if (!pending) return null;
    if (
      !(await this.accountantRepository.approve(
        pending.id,
        hashApprovalToken(token),
      ))
    ) {
      return null;
    }
    this.eventBus.publish(
      new AccountantApprovedEvent(pending.id, pending.email),
    );
    return pending;
  }

  async reject(token: string): Promise<PendingRegistration | null> {
    const pending = await this.findPending(token);
    if (!pending) return null;
    return this.dataSource.transaction(async (m) => {
      const deleted = await this.accountantRepository.deletePending(
        m,
        pending.id,
        hashApprovalToken(token),
      );
      if (!deleted) return null;
      await this.bannedEmailRepository.ban(m, pending.email);
      return pending;
    });
  }
}
