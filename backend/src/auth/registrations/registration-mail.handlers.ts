import { EventsHandler, IEventHandler } from '@nestjs/cqrs';
import { RegistrationMailer } from './services/registration-mailer.service.js';
import {
  AccountantApprovedEvent,
  AccountantRegisteredEvent,
} from './registration.events.js';

@EventsHandler(AccountantRegisteredEvent)
export class AdminApprovalMailHandler implements IEventHandler<AccountantRegisteredEvent> {
  constructor(private readonly registrationMailer: RegistrationMailer) {}

  async handle(event: AccountantRegisteredEvent): Promise<void> {
    await this.registrationMailer.notifyAdmin(event);
  }
}

@EventsHandler(AccountantApprovedEvent)
export class ApprovalNoticeMailHandler implements IEventHandler<AccountantApprovedEvent> {
  constructor(private readonly registrationMailer: RegistrationMailer) {}

  async handle(event: AccountantApprovedEvent): Promise<void> {
    await this.registrationMailer.notifyApproved(
      event.accountantId,
      event.email,
    );
  }
}
