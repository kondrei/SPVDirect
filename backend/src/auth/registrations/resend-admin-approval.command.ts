import { Command } from '@nestjs/cqrs';

export type ResendResult = 'sent' | 'failed' | 'skipped';

export class ResendAdminApprovalCommand extends Command<ResendResult> {
  constructor(readonly accountantId: number) {
    super();
  }
}
