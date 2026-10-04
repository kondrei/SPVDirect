import { Injectable } from '@nestjs/common';
import { EventBus } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash } from 'node:crypto';
import { Repository } from 'typeorm';
import { Accountant } from '../../../accountants/accountant.entity.js';
import { BannedEmail } from '../../banned-email.entity.js';
import { AccountantApprovedEvent } from '../registration.events.js';

export function hashApprovalToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export type PendingRegistration = Pick<
  Accountant,
  'id' | 'email' | 'name' | 'createdAt'
>;

@Injectable()
export class RegistrationsService {
  constructor(
    private readonly events: EventBus,
    @InjectRepository(Accountant)
    private readonly accountants: Repository<Accountant>,
  ) {}

  async findPending(token: string): Promise<PendingRegistration | null> {
    return this.accountants.findOne({
      select: { id: true, email: true, name: true, createdAt: true },
      where: { approvalTokenHash: hashApprovalToken(token), status: 'pending' },
    });
  }

  async approve(token: string): Promise<PendingRegistration | null> {
    const pending = await this.findPending(token);
    if (!pending) return null;
    const result = await this.accountants.update(
      {
        id: pending.id,
        approvalTokenHash: hashApprovalToken(token),
        status: 'pending',
      },
      { status: 'active', approvalTokenHash: null },
    );
    if (!result.affected) return null;
    this.events.publish(new AccountantApprovedEvent(pending.id, pending.email));
    return pending;
  }

  async reject(token: string): Promise<PendingRegistration | null> {
    const pending = await this.findPending(token);
    if (!pending) return null;
    return this.accountants.manager.transaction(async (m) => {
      const result = await m.delete(Accountant, {
        id: pending.id,
        approvalTokenHash: hashApprovalToken(token),
        status: 'pending',
      });
      if (!result.affected) return null;
      await m
        .createQueryBuilder()
        .insert()
        .into(BannedEmail)
        .values({ email: pending.email })
        .orIgnore()
        .execute();
      return pending;
    });
  }
}
