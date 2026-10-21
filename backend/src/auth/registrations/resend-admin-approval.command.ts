import { Command } from '@nestjs/cqrs';
import { ResendResult } from '../dto/auth.enums.js';

export class ResendAdminApprovalCommand extends Command<ResendResult> {
  constructor(readonly accountantId: number) {
    super();
  }
}
