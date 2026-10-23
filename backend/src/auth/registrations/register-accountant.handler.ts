import { ConflictException, ForbiddenException } from '@nestjs/common';
import { CommandHandler, EventBus, ICommandHandler } from '@nestjs/cqrs';
import { randomBytes } from 'node:crypto';
import { DataSource } from 'typeorm';
import type { Accountant } from '../../accountants/accountant.entity.js';
import { AccountantRepository } from '../../accountants/repositories/accountant.repository.js';
import { hashPassword } from '../../common/crypto/password.js';
import { isUniqueViolation } from '../../common/db-errors.js';
import { BannedEmailRepository } from '../repositories/banned-email.repository.js';
import { RecaptchaService } from '../services/recaptcha.service.js';
import { RegisterAccountantCommand } from './register-accountant.command.js';
import { AccountantRegisteredEvent } from './registration.events.js';
import { hashApprovalToken } from './services/registrations.service.js';

export const REGISTER_ACTION = 'register';
export const EMAIL_TAKEN = 'Există deja un cont sau o cerere cu acest email';
export const EMAIL_BANNED =
  'Înregistrarea cu această adresă de email nu este permisă';

@CommandHandler(RegisterAccountantCommand)
export class RegisterAccountantHandler implements ICommandHandler<RegisterAccountantCommand> {
  constructor(
    private readonly recaptchaService: RecaptchaService,
    private readonly dataSource: DataSource,
    private readonly eventBus: EventBus,
    private readonly accountantRepository: AccountantRepository,
    private readonly bannedEmailRepository: BannedEmailRepository,
  ) {}

  async execute({ dto, remoteIp }: RegisterAccountantCommand): Promise<void> {
    await this.recaptchaService.verify(
      dto.captchaToken,
      REGISTER_ACTION,
      remoteIp,
    );
    const passwordHash = await hashPassword(dto.password);
    const token = randomBytes(32).toString('base64url');

    let accountant: Accountant;
    try {
      accountant = await this.dataSource.transaction(async (m) => {
        if (await this.bannedEmailRepository.isBanned(m, dto.email)) {
          throw new ForbiddenException(EMAIL_BANNED);
        }
        if (await this.accountantRepository.existsByEmail(m, dto.email)) {
          throw new ConflictException(EMAIL_TAKEN);
        }
        return this.accountantRepository.insertPending(m, {
          email: dto.email,
          passwordHash,
          name: dto.name ?? null,
          approvalTokenHash: hashApprovalToken(token),
        });
      });
    } catch (err) {
      if (isUniqueViolation(err)) throw new ConflictException(EMAIL_TAKEN);
      throw err;
    }

    this.eventBus.publish(
      new AccountantRegisteredEvent(
        accountant.id,
        accountant.email,
        accountant.name,
        token,
      ),
    );
  }
}
