import { EventsHandler, IEventHandler } from '@nestjs/cqrs';
import { RegistrationMailer } from './registration-mailer.service.js';
import {
  AccountantApprovedEvent,
  AccountantRegisteredEvent,
} from './registration.events.js';

@EventsHandler(AccountantRegisteredEvent)
export class AdminApprovalMailHandler implements IEventHandler<AccountantRegisteredEvent> {
  constructor(private readonly mailer: RegistrationMailer) {}

  async handle(event: AccountantRegisteredEvent): Promise<void> {
    await this.mailer.notifyAdmin(event);
  }
}

@EventsHandler(AccountantApprovedEvent)
export class ApprovalNoticeMailHandler implements IEventHandler<AccountantApprovedEvent> {
  constructor(private readonly mailer: RegistrationMailer) {}

  async handle(event: AccountantApprovedEvent): Promise<void> {
    await this.mailer.notifyApproved(event.accountantId, event.email);
  }
}
