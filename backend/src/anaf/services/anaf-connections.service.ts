import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  certificateRemoved,
  certificateRenamed,
  certificateTested,
} from '../../api-logs/activity-entries.js';
import { ActivityLogsService } from '../../api-logs/activity-logs.service.js';
import type { AnafConnection } from '../anaf-connection.entity.js';
import { AnafConnectionRepository } from '../repositories/anaf-connection.repository.js';
import { redactBearerTokens } from '../redact-bearer.js';
import { AnafApiService } from './anaf-api.service.js';
import { AnafOAuthService } from './anaf-oauth.service.js';
import { ApiLogService } from '../../api-logs/dto/api-log.enums.js';
import type { ConnectionTestResult } from '../dto/anaf.types.js';

@Injectable()
export class AnafConnectionsService {
  private readonly logger = new Logger(AnafConnectionsService.name);

  constructor(
    private readonly anafApiService: AnafApiService,
    private readonly anafOAuthService: AnafOAuthService,
    private readonly anafConnectionRepository: AnafConnectionRepository,
    private readonly activityLogsService: ActivityLogsService,
  ) {}

  list(accountantId: number): Promise<AnafConnection[]> {
    return this.anafConnectionRepository.listNewestFirst(accountantId);
  }

  async rename(
    accountantId: number,
    id: number,
    label: string,
  ): Promise<AnafConnection> {
    const connection = await this.get(accountantId, id);
    connection.label = label;
    const saved = await this.anafConnectionRepository.save(connection);
    await this.activityLogsService.record(
      accountantId,
      certificateRenamed(saved),
    );
    return saved;
  }

  async remove(accountantId: number, id: number): Promise<void> {
    const connection = await this.removeConnection(accountantId, id);
    await this.activityLogsService.record(
      accountantId,
      certificateRemoved({
        id,
        label: connection.label,
        certSerial: connection.certSerial,
      }),
    );
  }

  async removeAll(accountantId: number): Promise<number[]> {
    const connections = await this.anafConnectionRepository.idsOf(accountantId);
    const results = await Promise.allSettled(
      connections.map(({ id }) => this.removeConnection(accountantId, id)),
    );
    const failed: number[] = [];
    results.forEach((result, i) => {
      if (result.status === 'fulfilled') return;
      const id = connections[i].id;
      failed.push(id);
      this.logger.warn(
        `Removing ANAF connection ${id} of account ${accountantId} failed: ${(result.reason as Error).message}`,
      );
    });
    return failed;
  }

  async test(accountantId: number, id: number): Promise<ConnectionTestResult> {
    const connection = await this.get(accountantId, id);
    const res = await this.anafApiService.request<string>({
      accountantId,
      connectionId: id,
      service: ApiLogService.TestOAuth,
      path: '/TestOauth/jaxrs/hello',
      params: { name: 'SPVDirect' },
      responseType: 'text',
    });
    await this.activityLogsService.record(
      accountantId,
      certificateTested(connection, res.status),
    );
    return { status: res.status, body: redactBearerTokens(res.data) };
  }

  private async removeConnection(
    accountantId: number,
    id: number,
  ): Promise<AnafConnection> {
    const connection = await this.get(accountantId, id);
    await this.anafOAuthService.revokeConnection(connection.id);
    await this.anafConnectionRepository.remove(connection);
    return connection;
  }

  private async get(accountantId: number, id: number): Promise<AnafConnection> {
    const connection = await this.anafConnectionRepository.findOwned(
      accountantId,
      id,
    );
    if (!connection) throw new NotFoundException('Conexiune ANAF inexistentă');
    return connection;
  }
}
