import { IsNull, type Repository } from 'typeorm';
import type { Accountant } from '../../accountants/accountant.entity.js';
import type { RegistrationMailer } from './services/registration-mailer.service.js';
import { hashApprovalToken } from './services/registrations.service.js';
import { ResendAdminApprovalCommand } from './resend-admin-approval.command.js';
import { ResendAdminApprovalHandler } from './resend-admin-approval.handler.js';

const pending = {
  id: 7,
  email: 'new@example.com',
  name: 'Ana',
  approvalTokenHash: 'old-hash',
};

function setup() {
  const notifyAdmin = vi.fn().mockResolvedValue(true);
  const accountants = {
    findOne: vi.fn().mockResolvedValue(pending),
    update: vi.fn().mockResolvedValue({ affected: 1 }),
  };
  const handler = new ResendAdminApprovalHandler(
    { notifyAdmin } as unknown as RegistrationMailer,
    accountants as unknown as Repository<Accountant>,
  );
  const run = () => handler.execute(new ResendAdminApprovalCommand(7));
  return { run, notifyAdmin, accountants };
}

const unnotified = { id: 7, status: 'pending', adminNotifiedAt: IsNull() };

describe('ResendAdminApprovalHandler', () => {
  it('looks only at pending requests the admin was never told about', async () => {
    const { run, accountants } = setup();
    await run();
    expect(accountants.findOne).toHaveBeenCalledWith(
      expect.objectContaining({ where: unnotified }),
    );
  });

  it('replaces the token, then emails the admin with the new one', async () => {
    const { run, accountants, notifyAdmin } = setup();
    await expect(run()).resolves.toBe('sent');
    const { approvalToken } = notifyAdmin.mock.calls[0][0] as {
      approvalToken: string;
    };
    expect(accountants.update).toHaveBeenCalledWith(
      { ...unnotified, approvalTokenHash: 'old-hash' },
      { approvalTokenHash: hashApprovalToken(approvalToken) },
    );
    expect(notifyAdmin).toHaveBeenCalledWith({
      accountantId: 7,
      email: 'new@example.com',
      name: 'Ana',
      approvalToken,
    });
  });

  it('reports a failed send', async () => {
    const { run, notifyAdmin } = setup();
    notifyAdmin.mockResolvedValue(false);
    await expect(run()).resolves.toBe('failed');
  });

  it('skips a request that is gone, approved or already notified', async () => {
    const { run, accountants, notifyAdmin } = setup();
    accountants.findOne.mockResolvedValue(null);
    await expect(run()).resolves.toBe('skipped');
    expect(accountants.update).not.toHaveBeenCalled();
    expect(notifyAdmin).not.toHaveBeenCalled();
  });

  it('skips when another resend claimed the request first', async () => {
    const { run, accountants, notifyAdmin } = setup();
    accountants.update.mockResolvedValue({ affected: 0 });
    await expect(run()).resolves.toBe('skipped');
    expect(notifyAdmin).not.toHaveBeenCalled();
  });
});
