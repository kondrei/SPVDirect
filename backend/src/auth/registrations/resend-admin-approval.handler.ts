import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { randomBytes } from 'node:crypto';
import { AccountantRepository } from '../../accountants/repositories/accountant.repository.js';
import { RegistrationMailer } from './services/registration-mailer.service.js';
import { hashApprovalToken } from './services/registrations.service.js';
import { ResendAdminApprovalCommand } from './resend-admin-approval.command.js';
import { ResendResult } from '../dto/auth.enums.js';

@CommandHandler(ResendAdminApprovalCommand)
export class ResendAdminApprovalHandler implements ICommandHandler<ResendAdminApprovalCommand> {
  constructor(
    private readonly registrationMailer: RegistrationMailer,
    private readonly accountantRepository: AccountantRepository,
  ) {}

  async execute({
    accountantId,
  }: ResendAdminApprovalCommand): Promise<ResendResult> {
    const pending =
      await this.accountantRepository.findUnnotifiedPending(accountantId);
    if (!pending?.approvalTokenHash) return ResendResult.Skipped;

    const token = randomBytes(32).toString('base64url');
    const claimed = await this.accountantRepository.swapApprovalToken(
      accountantId,
      pending.approvalTokenHash,
      hashApprovalToken(token),
    );
    if (!claimed) return ResendResult.Skipped;

    const sent = await this.registrationMailer.notifyAdmin({
      accountantId: pending.id,
      email: pending.email,
      name: pending.name,
      approvalToken: token,
    });
    return sent ? ResendResult.Sent : ResendResult.Failed;
  }
}
