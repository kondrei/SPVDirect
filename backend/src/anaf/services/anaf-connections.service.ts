import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AnafConnection } from '../anaf-connection.entity.js';
import { redactBearerTokens } from '../redact-bearer.js';
import { AnafApiService } from './anaf-api.service.js';
import { AnafOAuthService } from './anaf-oauth.service.js';
import { ApiLogService } from '../../api-logs/dto/api-log.enums.js';

export interface ConnectionTestResult {
  status: number;
  body: string;
}

@Injectable()
export class AnafConnectionsService {
  private readonly logger = new Logger(AnafConnectionsService.name);

  constructor(
    private readonly api: AnafApiService,
    private readonly oauth: AnafOAuthService,
    @InjectRepository(AnafConnection)
    private readonly connections: Repository<AnafConnection>,
  ) {}

  list(accountantId: number): Promise<AnafConnection[]> {
    return this.connections.find({
      where: { accountantId },
      order: { createdAt: 'DESC' },
    });
  }

  async rename(
    accountantId: number,
    id: number,
    label: string,
  ): Promise<AnafConnection> {
    const connection = await this.get(accountantId, id);
    connection.label = label;
    return this.connections.save(connection);
  }

  async remove(accountantId: number, id: number): Promise<void> {
    const connection = await this.get(accountantId, id);
    await this.oauth.revokeConnection(connection.id);
    await this.connections.remove(connection);
  }

  async removeAll(accountantId: number): Promise<number[]> {
    const connections = await this.connections.find({
      select: { id: true },
      where: { accountantId },
    });
    const results = await Promise.allSettled(
      connections.map(({ id }) => this.remove(accountantId, id)),
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
    const res = await this.api.request<string>({
      accountantId,
      connectionId: id,
      service: ApiLogService.TestOAuth,
      path: '/TestOauth/jaxrs/hello',
      params: { name: 'SPVDirect' },
      responseType: 'text',
    });
    return { status: res.status, body: redactBearerTokens(res.data) };
  }

  private async get(accountantId: number, id: number): Promise<AnafConnection> {
    const connection = await this.connections.findOneBy({ id, accountantId });
    if (!connection) throw new NotFoundException('Conexiune ANAF inexistentă');
    return connection;
  }
}
