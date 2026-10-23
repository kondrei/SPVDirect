import { Injectable, Logger } from '@nestjs/common';
import { certificateConnected } from '../../api-logs/activity-entries.js';
import { ActivityLogsService } from '../../api-logs/activity-logs.service.js';
import { CompaniesService } from '../../companies/services/companies.service.js';
import { AuthorizationLinksService } from '../authorization-links/authorization-links.service.js';
import type { AnafConnection } from '../anaf-connection.entity.js';
import type { OAuthStatePayload } from '../oauth-state.js';
import { AnafOAuthService } from './anaf-oauth.service.js';
import { AnafTokenClient } from './anaf-token-client.service.js';
import {
  AnafConnectionSource,
  LinkFailure,
  AuthorizationOutcomeKind,
} from '../dto/anaf.enums.js';
import type { AuthorizationOutcome } from '../dto/anaf.types.js';

@Injectable()
export class AnafAuthorizationService {
  private readonly logger = new Logger(AnafAuthorizationService.name);

  constructor(
    private readonly anafTokenClient: AnafTokenClient,
    private readonly anafOAuthService: AnafOAuthService,
    private readonly authorizationLinksService: AuthorizationLinksService,
    private readonly companiesService: CompaniesService,
    private readonly activityLogsService: ActivityLogsService,
  ) {}

  authorizeUrl(state: string): string {
    return this.anafTokenClient.buildAuthorizeUrl(state);
  }

  async complete(
    payload: OAuthStatePayload,
    code: string,
  ): Promise<AuthorizationOutcome> {
    const tokens = await this.anafTokenClient.exchangeCode(code);
    if (payload.mode === AnafConnectionSource.Self) {
      const connection = await this.anafOAuthService.saveConnection(
        payload.accountantId,
        tokens,
        AnafConnectionSource.Self,
      );
      await this.activityLogsService.record(
        payload.accountantId,
        certificateConnected(connection, null),
      );
      return {
        kind: AuthorizationOutcomeKind.Self,
        accountantId: payload.accountantId,
      };
    }

    const lookup = await this.authorizationLinksService.findById(
      payload.linkId,
    );
    if (!lookup.ok)
      return {
        kind: AuthorizationOutcomeKind.LinkInvalid,
        reason: lookup.reason,
      };
    if (!(await this.authorizationLinksService.claim(lookup.link.id))) {
      return {
        kind: AuthorizationOutcomeKind.LinkInvalid,
        reason: LinkFailure.Used,
      };
    }
    let connection: AnafConnection;
    try {
      connection = await this.anafOAuthService.saveConnection(
        lookup.link.accountantId,
        tokens,
        AnafConnectionSource.Link,
      );
    } catch (err) {
      await this.authorizationLinksService.release(lookup.link.id);
      throw err;
    }
    await this.authorizationLinksService.attachConnection(
      lookup.link.id,
      connection.id,
    );
    await this.companiesService.attachConnection(
      lookup.company.id,
      connection.id,
    );
    await this.activityLogsService.record(
      lookup.link.accountantId,
      certificateConnected(connection, lookup.company),
    );
    this.logger.log(
      `Authorization link ${lookup.link.id} completed for company ${lookup.company.id}`,
    );
    return {
      kind: AuthorizationOutcomeKind.Link,
      companyName: lookup.company.name,
    };
  }
}
