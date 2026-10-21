import { Injectable, Logger } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, LessThan, Repository } from 'typeorm';
import { Accountant } from '../../accountants/accountant.entity.js';
import { ActivityLogsService } from '../../api-logs/activity-logs.service.js';
import {
  adminApprovalRetryCompleted,
  jobFailed,
} from '../../api-logs/activity-entries.js';
import { ScheduledJob } from '../../api-logs/dto/api-log.enums.js';
import type { AdminApprovalRetryCounts } from '../../api-logs/dto/api-log.types.js';
import {
  ADMIN_APPROVAL_RETRY_SCHEDULE,
  CRON_OPTIONS,
} from '../../common/constants.js';
import { ResendAdminApprovalCommand } from './resend-admin-approval.command.js';
import { AccountStatus } from '../../accountants/dto/accountant.enums.js';
import { ResendResult } from '../dto/auth.enums.js';

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
    private readonly activity: ActivityLogsService,
  ) {}

  @Cron(ADMIN_APPROVAL_RETRY_SCHEDULE, CRON_OPTIONS)
  async run(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const due = await this.accountants.find({
        select: { id: true },
        where: {
          status: AccountStatus.Pending,
          adminNotifiedAt: IsNull(),
          createdAt: LessThan(new Date(Date.now() - RETRY_GRACE_MS)),
        },
        order: { id: 'ASC' },
        take: RETRY_BATCH,
      });
      const counts: AdminApprovalRetryCounts = {
        sent: 0,
        skipped: 0,
        failed: 0,
      };
      for (const { id } of due) {
        const result = await this.commands.execute(
          new ResendAdminApprovalCommand(id),
        );
        if (result === ResendResult.Failed) {
          counts.failed++;
          break;
        }
        if (result === ResendResult.Sent) counts.sent++;
        else counts.skipped++;
      }
      await this.activity.recordJob(adminApprovalRetryCompleted(counts));
    } catch (err) {
      this.logger.error(
        `Retrying admin approval emails failed: ${(err as Error).message}`,
      );
      await this.activity.recordJob(
        jobFailed(ScheduledJob.AdminApprovalRetry, err),
      );
    } finally {
      this.running = false;
    }
  }
}
