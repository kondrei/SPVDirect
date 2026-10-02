import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import type { EventBus } from '@nestjs/cqrs';
import { QueryFailedError, type DataSource } from 'typeorm';
import { Accountant } from '../../accountants/accountant.entity.js';
import { verifyPassword } from '../../common/crypto/password.js';
import { BannedEmail } from '../banned-email.entity.js';
import type { RecaptchaService } from '../recaptcha.service.js';
import { RegisterAccountantCommand } from './register-accountant.command.js';
import {
  EMAIL_BANNED,
  RegisterAccountantHandler,
} from './register-accountant.handler.js';
import { AccountantRegisteredEvent } from './registration.events.js';
import { hashApprovalToken } from './registrations.service.js';

const dto = {
  email: 'new@example.com',
  password: 'a-long-password',
  name: 'Ana',
  captchaToken: 'captcha',
};

function setup() {
  const verify = vi.fn().mockResolvedValue(undefined);
  const publish = vi.fn();
  const manager = {
    existsBy: vi.fn().mockResolvedValue(false),
    create: vi.fn((_: unknown, data: object) => data),
    save: vi.fn((data: object) => Promise.resolve({ ...data, id: 7 })),
  };
  const transaction = vi.fn((fn: (m: unknown) => unknown) => fn(manager));
  const handler = new RegisterAccountantHandler(
    { verify } as unknown as RecaptchaService,
    { transaction } as unknown as DataSource,
    { publish } as unknown as EventBus,
  );
  const run = (ip?: string) =>
    handler.execute(new RegisterAccountantCommand(dto, ip));
  return { run, verify, publish, manager, transaction };
}

describe('RegisterAccountantHandler', () => {
  it('verifies the captcha for the register action with the client IP', async () => {
    const { run, verify } = setup();
    await run('1.2.3.4');
    expect(verify).toHaveBeenCalledWith('captcha', 'register', '1.2.3.4');
  });

  it('stops before the database when the captcha fails', async () => {
    const { run, verify, transaction } = setup();
    verify.mockRejectedValue(new BadRequestException('captcha'));
    await expect(run()).rejects.toBeInstanceOf(BadRequestException);
    expect(transaction).not.toHaveBeenCalled();
  });

  it('checks and inserts the pending accountant inside one transaction', async () => {
    const { run, manager, transaction } = setup();
    await run();
    expect(transaction).toHaveBeenCalledOnce();
    expect(manager.existsBy).toHaveBeenCalledWith(BannedEmail, {
      email: dto.email,
    });
    expect(manager.existsBy).toHaveBeenCalledWith(Accountant, {
      email: dto.email,
    });
    const saved = manager.save.mock.calls[0][0] as Record<string, string>;
    expect(saved).toMatchObject({
      email: dto.email,
      name: 'Ana',
      status: 'pending',
    });
    expect(await verifyPassword(dto.password, saved.passwordHash)).toBe(true);
  });

  it('publishes the event with the token whose hash was stored', async () => {
    const { run, manager, publish } = setup();
    await run();
    const event = publish.mock.calls[0][0] as AccountantRegisteredEvent;
    expect(event).toBeInstanceOf(AccountantRegisteredEvent);
    expect(event).toMatchObject({
      accountantId: 7,
      email: dto.email,
      name: 'Ana',
    });
    expect(event.approvalToken).toMatch(/^[\w-]{43}$/);
    const saved = manager.save.mock.calls[0][0] as Record<string, string>;
    expect(saved.approvalTokenHash).toBe(
      hashApprovalToken(event.approvalToken),
    );
  });

  it('refuses a banned email with 403 and publishes nothing', async () => {
    const { run, manager, publish } = setup();
    manager.existsBy.mockImplementation((entity: unknown) =>
      Promise.resolve(entity === BannedEmail),
    );
    await expect(run()).rejects.toThrow(new ForbiddenException(EMAIL_BANNED));
    expect(manager.save).not.toHaveBeenCalled();
    expect(publish).not.toHaveBeenCalled();
  });

  it('refuses an existing account or pending request with 409', async () => {
    const { run, manager } = setup();
    manager.existsBy.mockImplementation((entity: unknown) =>
      Promise.resolve(entity === Accountant),
    );
    await expect(run()).rejects.toBeInstanceOf(ConflictException);
  });

  it('maps a concurrent duplicate insert to 409', async () => {
    const { run, manager, publish } = setup();
    manager.save.mockRejectedValue(
      new QueryFailedError(
        'INSERT',
        [],
        Object.assign(new Error('dup'), { code: '23505' }),
      ),
    );
    await expect(run()).rejects.toBeInstanceOf(ConflictException);
    expect(publish).not.toHaveBeenCalled();
  });

  it('rethrows other database errors', async () => {
    const { run, manager } = setup();
    manager.save.mockRejectedValue(new Error('connection lost'));
    await expect(run()).rejects.toThrow('connection lost');
  });
});
