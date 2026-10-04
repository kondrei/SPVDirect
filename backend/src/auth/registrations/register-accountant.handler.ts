import { ConflictException, ForbiddenException } from '@nestjs/common';
import { CommandHandler, EventBus, ICommandHandler } from '@nestjs/cqrs';
import { randomBytes } from 'node:crypto';
import { DataSource } from 'typeorm';
import { Accountant } from '../../accountants/accountant.entity.js';
import { hashPassword } from '../../common/crypto/password.js';
import { isUniqueViolation } from '../../common/db-errors.js';
import { BannedEmail } from '../banned-email.entity.js';
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
    private readonly recaptcha: RecaptchaService,
    private readonly dataSource: DataSource,
    private readonly events: EventBus,
  ) {}

  async execute({ dto, remoteIp }: RegisterAccountantCommand): Promise<void> {
    await this.recaptcha.verify(dto.captchaToken, REGISTER_ACTION, remoteIp);
    const passwordHash = await hashPassword(dto.password);
    const token = randomBytes(32).toString('base64url');

    let accountant: Accountant;
    try {
      accountant = await this.dataSource.transaction(async (m) => {
        if (await m.existsBy(BannedEmail, { email: dto.email })) {
          throw new ForbiddenException(EMAIL_BANNED);
        }
        if (await m.existsBy(Accountant, { email: dto.email })) {
          throw new ConflictException(EMAIL_TAKEN);
        }
        return m.save(
          m.create(Accountant, {
            email: dto.email,
            passwordHash,
            name: dto.name ?? null,
            status: 'pending',
            approvalTokenHash: hashApprovalToken(token),
          }),
        );
      });
    } catch (err) {
      if (isUniqueViolation(err)) throw new ConflictException(EMAIL_TAKEN);
      throw err;
    }

    this.events.publish(
      new AccountantRegisteredEvent(
        accountant.id,
        accountant.email,
        accountant.name,
        token,
      ),
    );
  }
}
