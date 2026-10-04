import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomBytes } from 'node:crypto';
import { IsNull, Repository } from 'typeorm';
import { CompaniesService } from '../../companies/services/companies.service.js';
import { Company } from '../../companies/company.entity.js';
import { AuthorizationLink } from './authorization-link.entity.js';

export const LINK_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type LinkLookup =
  | { ok: true; link: AuthorizationLink; company: Company }
  | { ok: false; reason: 'not_found' | 'used' | 'expired' };

export function hashLinkToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

@Injectable()
export class AuthorizationLinksService {
  constructor(
    private readonly config: ConfigService,
    private readonly companies: CompaniesService,
    @InjectRepository(AuthorizationLink)
    private readonly links: Repository<AuthorizationLink>,
  ) {}

  async create(accountantId: number, companyId: number) {
    const company = await this.companies.get(accountantId, companyId);
    const token = randomBytes(32).toString('base64url');
    const link = await this.links.save(
      this.links.create({
        accountantId,
        companyId: company.id,
        tokenHash: hashLinkToken(token),
        expiresAt: new Date(Date.now() + LINK_TTL_MS),
      }),
    );
    return {
      id: link.id,
      url: `${this.config.getOrThrow<string>('API_URL')}/anaf/authorize/${token}`,
      expiresAt: link.expiresAt,
    };
  }

  async findByToken(token: string): Promise<LinkLookup> {
    const link = await this.links.findOneBy({
      tokenHash: hashLinkToken(token),
    });
    return this.check(link);
  }

  async findById(id: string): Promise<LinkLookup> {
    return this.check(await this.links.findOneBy({ id }));
  }

  async markUsed(linkId: string, connectionId: string): Promise<boolean> {
    const result = await this.links.update(
      { id: linkId, usedAt: IsNull() },
      { usedAt: new Date(), anafConnectionId: connectionId },
    );
    return (result.affected ?? 0) > 0;
  }

  private async check(link: AuthorizationLink | null): Promise<LinkLookup> {
    if (!link) return { ok: false, reason: 'not_found' };
    if (link.usedAt) return { ok: false, reason: 'used' };
    if (link.expiresAt.getTime() <= Date.now()) {
      return { ok: false, reason: 'expired' };
    }
    const company = await this.companies.get(link.accountantId, link.companyId);
    return { ok: true, link, company };
  }
}
