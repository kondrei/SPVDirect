import { Injectable, Logger } from '@nestjs/common';
import { CompaniesService } from '../../companies/services/companies.service.js';
import {
  AuthorizationLinksService,
  type LinkLookup,
} from '../authorization-links/authorization-links.service.js';
import type { OAuthStatePayload } from '../oauth-state.js';
import { AnafOAuthService } from './anaf-oauth.service.js';
import { AnafTokenClient } from './anaf-token-client.service.js';

export type LinkFailure = Exclude<LinkLookup, { ok: true }>['reason'];

export type AuthorizationOutcome =
  | { kind: 'self'; accountantId: number }
  | { kind: 'link'; companyName: string }
  | { kind: 'link-invalid'; reason: LinkFailure };

@Injectable()
export class AnafAuthorizationService {
  private readonly logger = new Logger(AnafAuthorizationService.name);

  constructor(
    private readonly tokens: AnafTokenClient,
    private readonly oauth: AnafOAuthService,
    private readonly links: AuthorizationLinksService,
    private readonly companies: CompaniesService,
  ) {}

  authorizeUrl(state: string): string {
    return this.tokens.buildAuthorizeUrl(state);
  }

  async complete(
    payload: OAuthStatePayload,
    code: string,
  ): Promise<AuthorizationOutcome> {
    const tokens = await this.tokens.exchangeCode(code);
    if (payload.mode === 'self') {
      await this.oauth.saveConnection(payload.accountantId, tokens, 'self');
      return { kind: 'self', accountantId: payload.accountantId };
    }

    const lookup = await this.links.findById(payload.linkId);
    if (!lookup.ok) return { kind: 'link-invalid', reason: lookup.reason };
    if (!(await this.links.claim(lookup.link.id))) {
      return { kind: 'link-invalid', reason: 'used' };
    }
    let connectionId: number;
    try {
      connectionId = (
        await this.oauth.saveConnection(
          lookup.link.accountantId,
          tokens,
          'link',
        )
      ).id;
    } catch (err) {
      await this.links.release(lookup.link.id);
      throw err;
    }
    await this.links.attachConnection(lookup.link.id, connectionId);
    await this.companies.attachConnection(lookup.company.id, connectionId);
    this.logger.log(
      `Authorization link ${lookup.link.id} completed for company ${lookup.company.id}`,
    );
    return { kind: 'link', companyName: lookup.company.name };
  }
}
