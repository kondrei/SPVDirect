import {
  AdminApprovalMailHandler,
  ApprovalNoticeMailHandler,
} from './registration-mail.handlers.js';
import type { RegistrationMailer } from './registration-mailer.service.js';
import {
  AccountantApprovedEvent,
  AccountantRegisteredEvent,
} from './registration.events.js';

function setup() {
  const mailer = {
    notifyAdmin: vi.fn().mockResolvedValue(true),
    notifyApproved: vi.fn().mockResolvedValue(true),
  };
  return {
    mailer,
    admin: new AdminApprovalMailHandler(
      mailer as unknown as RegistrationMailer,
    ),
    notice: new ApprovalNoticeMailHandler(
      mailer as unknown as RegistrationMailer,
    ),
  };
}

describe('registration mail event handlers', () => {
  it('asks the admin to approve a new registration', async () => {
    const { admin, mailer } = setup();
    const event = new AccountantRegisteredEvent(
      7,
      'a@example.com',
      'Ana',
      'tok',
    );
    await admin.handle(event);
    expect(mailer.notifyAdmin).toHaveBeenCalledWith(event);
  });

  it('tells the user when the account is approved', async () => {
    const { notice, mailer } = setup();
    await notice.handle(new AccountantApprovedEvent(7, 'a@example.com'));
    expect(mailer.notifyApproved).toHaveBeenCalledWith(7, 'a@example.com');
  });
});
