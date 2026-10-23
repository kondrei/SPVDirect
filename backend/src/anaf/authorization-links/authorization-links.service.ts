import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'node:crypto';
import { authorizationLinkCreated } from '../../api-logs/activity-entries.js';
import { ActivityLogsService } from '../../api-logs/activity-logs.service.js';
import { CompaniesService } from '../../companies/services/companies.service.js';

import type { AuthorizationLink } from './authorization-link.entity.js';
import { AuthorizationLinkRepository } from './repositories/authorization-link.repository.js';
import { LinkFailure } from '../dto/anaf.enums.js';
import type { LinkLookup } from '../dto/anaf.types.js';

export const LINK_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function hashLinkToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

@Injectable()
export class AuthorizationLinksService {
  constructor(
    private readonly configService: ConfigService,
    private readonly companiesService: CompaniesService,
    private readonly authorizationLinkRepository: AuthorizationLinkRepository,
    private readonly activityLogsService: ActivityLogsService,
  ) {}

  async create(accountantId: number, companyId: number) {
    const company = await this.companiesService.get(accountantId, companyId);
    const token = randomBytes(32).toString('base64url');
    const link = await this.authorizationLinkRepository.insert({
      accountantId,
      companyId: company.id,
      tokenHash: hashLinkToken(token),
      expiresAt: new Date(Date.now() + LINK_TTL_MS),
    });
    await this.activityLogsService.record(
      accountantId,
      authorizationLinkCreated(company, link.expiresAt),
    );
    return {
      id: link.id,
      url: `${this.configService.getOrThrow<string>('API_URL')}/anaf/authorize/${token}`,
      expiresAt: link.expiresAt,
    };
  }

  async findByToken(token: string): Promise<LinkLookup> {
    const link = await this.authorizationLinkRepository.findByTokenHash(
      hashLinkToken(token),
    );
    return this.check(link);
  }

  async findById(id: number): Promise<LinkLookup> {
    return this.check(await this.authorizationLinkRepository.findById(id));
  }

  claim(linkId: number): Promise<boolean> {
    return this.authorizationLinkRepository.claim(linkId);
  }

  release(linkId: number): Promise<void> {
    return this.authorizationLinkRepository.release(linkId);
  }

  attachConnection(linkId: number, connectionId: number): Promise<void> {
    return this.authorizationLinkRepository.attachConnection(
      linkId,
      connectionId,
    );
  }

  private async check(link: AuthorizationLink | null): Promise<LinkLookup> {
    if (!link) return { ok: false, reason: LinkFailure.NotFound };
    if (link.usedAt) return { ok: false, reason: LinkFailure.Used };
    if (link.expiresAt.getTime() <= Date.now()) {
      return { ok: false, reason: LinkFailure.Expired };
    }
    const company = await this.companiesService.get(
      link.accountantId,
      link.companyId,
    );
    return { ok: true, link, company };
  }
}
