import { Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { BannedEmail } from '../banned-email.entity.js';

@Injectable()
export class BannedEmailRepository {
  isBanned(manager: EntityManager, email: string): Promise<boolean> {
    return manager.existsBy(BannedEmail, { email });
  }

  async ban(manager: EntityManager, email: string): Promise<void> {
    await manager
      .createQueryBuilder()
      .insert()
      .into(BannedEmail)
      .values({ email })
      .orIgnore()
      .execute();
  }
}
