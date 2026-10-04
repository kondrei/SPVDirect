import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { randomBytes } from 'node:crypto';
import { IsNull, Repository } from 'typeorm';
import { Accountant } from '../../accountants/accountant.entity.js';
import { RegistrationMailer } from './services/registration-mailer.service.js';
import { hashApprovalToken } from './services/registrations.service.js';
import {
  ResendAdminApprovalCommand,
  type ResendResult,
} from './resend-admin-approval.command.js';

@CommandHandler(ResendAdminApprovalCommand)
export class ResendAdminApprovalHandler implements ICommandHandler<ResendAdminApprovalCommand> {
  constructor(
    private readonly mailer: RegistrationMailer,
    @InjectRepository(Accountant)
    private readonly accountants: Repository<Accountant>,
  ) {}

  async execute({
    accountantId,
  }: ResendAdminApprovalCommand): Promise<ResendResult> {
    const unnotified = {
      id: accountantId,
      status: 'pending' as const,
      adminNotifiedAt: IsNull(),
    };
    const pending = await this.accountants.findOne({
      select: { id: true, email: true, name: true, approvalTokenHash: true },
      where: unnotified,
    });
    if (!pending?.approvalTokenHash) return 'skipped';

    const token = randomBytes(32).toString('base64url');
    const claimed = await this.accountants.update(
      { ...unnotified, approvalTokenHash: pending.approvalTokenHash },
      { approvalTokenHash: hashApprovalToken(token) },
    );
    if (!claimed.affected) return 'skipped';

    const sent = await this.mailer.notifyAdmin({
      accountantId: pending.id,
      email: pending.email,
      name: pending.name,
      approvalToken: token,
    });
    return sent ? 'sent' : 'failed';
  }
}
