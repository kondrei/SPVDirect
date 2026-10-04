import type { EventBus } from '@nestjs/cqrs';
import type { Repository } from 'typeorm';
import type { Accountant } from '../../../accountants/accountant.entity.js';
import { AccountantApprovedEvent } from '../registration.events.js';
import {
  hashApprovalToken,
  RegistrationsService,
} from './registrations.service.js';

const pending = {
  id: 7,
  email: 'new@example.com',
  name: 'Ana',
  createdAt: new Date('2026-09-28T10:00:00Z'),
};

function setup() {
  const publish = vi.fn();
  const execute = vi.fn().mockResolvedValue({});
  const qb = {
    insert: () => qb,
    into: () => qb,
    values: vi.fn(() => qb),
    orIgnore: () => qb,
    execute,
  };
  const manager = {
    delete: vi.fn().mockResolvedValue({ affected: 1 }),
    createQueryBuilder: () => qb,
  };
  const accountants = {
    findOne: vi.fn().mockResolvedValue(pending),
    update: vi.fn().mockResolvedValue({ affected: 1 }),
    manager: {
      transaction: vi.fn((fn: (m: unknown) => unknown) => fn(manager)),
    },
  };
  const service = new RegistrationsService(
    { publish } as unknown as EventBus,
    accountants as unknown as Repository<Accountant>,
  );
  return { service, publish, accountants, manager, qb, execute };
}

describe('RegistrationsService', () => {
  it('looks up only pending requests by token hash', async () => {
    const { service, accountants } = setup();
    await service.findPending('tok');
    expect(accountants.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          approvalTokenHash: hashApprovalToken('tok'),
          status: 'pending',
        },
      }),
    );
  });

  it('activates the account, clears the token and publishes the approval', async () => {
    const { service, accountants, publish } = setup();
    await expect(service.approve('tok')).resolves.toEqual(pending);
    expect(accountants.update).toHaveBeenCalledWith(
      { id: 7, approvalTokenHash: hashApprovalToken('tok'), status: 'pending' },
      { status: 'active', approvalTokenHash: null },
    );
    expect(publish).toHaveBeenCalledWith(
      new AccountantApprovedEvent(7, 'new@example.com'),
    );
  });

  it('returns null for an unknown or already handled token', async () => {
    const { service, accountants } = setup();
    accountants.findOne.mockResolvedValue(null);
    await expect(service.approve('tok')).resolves.toBeNull();
    await expect(service.reject('tok')).resolves.toBeNull();
    expect(accountants.update).not.toHaveBeenCalled();
    expect(accountants.manager.transaction).not.toHaveBeenCalled();
  });

  it('publishes nothing when a concurrent decision won the race', async () => {
    const { service, accountants, publish } = setup();
    accountants.update.mockResolvedValue({ affected: 0 });
    await expect(service.approve('tok')).resolves.toBeNull();
    expect(publish).not.toHaveBeenCalled();
  });

  it('deletes the pending request and bans the email in one transaction', async () => {
    const { service, manager, qb, execute } = setup();
    await expect(service.reject('tok')).resolves.toEqual(pending);
    expect(manager.delete).toHaveBeenCalledWith(expect.anything(), {
      id: 7,
      approvalTokenHash: hashApprovalToken('tok'),
      status: 'pending',
    });
    expect(qb.values).toHaveBeenCalledWith({ email: pending.email });
    expect(execute).toHaveBeenCalled();
  });

  it('does not ban when the request was already handled', async () => {
    const { service, manager, execute } = setup();
    manager.delete.mockResolvedValue({ affected: 0 });
    await expect(service.reject('tok')).resolves.toBeNull();
    expect(execute).not.toHaveBeenCalled();
  });
});
