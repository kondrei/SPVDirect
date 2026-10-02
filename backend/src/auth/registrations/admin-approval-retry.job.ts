import { Injectable, Logger } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, LessThan, Repository } from 'typeorm';
import { Accountant } from '../../accountants/accountant.entity.js';
import { ResendAdminApprovalCommand } from './resend-admin-approval.command.js';

export const RETRY_SCHEDULE = CronExpression.EVERY_DAY_AT_8AM;
export const RETRY_GRACE_MS = 5 * 60_000;
export const RETRY_BATCH = 50;

@Injectable()
export class AdminApprovalRetryJob {
  private readonly logger = new Logger(AdminApprovalRetryJob.name);
  private running = false;

  constructor(
    private readonly commands: CommandBus,
    @InjectRepository(Accountant)
    private readonly accountants: Repository<Accountant>,
  ) { }

  @Cron(RETRY_SCHEDULE, { timeZone: 'Europe/Bucharest' })
  async run(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const due = await this.accountants.find({
        select: { id: true },
        where: {
          status: 'pending',
          adminNotifiedAt: IsNull(),
          createdAt: LessThan(new Date(Date.now() - RETRY_GRACE_MS)),
        },
        order: { id: 'ASC' },
        take: RETRY_BATCH,
      });
      for (const { id } of due) {
        const result = await this.commands.execute(
          new ResendAdminApprovalCommand(id),
        );
        if (result === 'failed') break;
      }
    } catch (err) {
      this.logger.error(
        `Retrying admin approval emails failed: ${(err as Error).message}`,
      );
    } finally {
      this.running = false;
    }
  }
}
