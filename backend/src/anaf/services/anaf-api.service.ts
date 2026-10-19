import {
  BadGatewayException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import type { AxiosResponse, Method, ResponseType } from 'axios';
import { isAxiosError } from 'axios';
import { Repository } from 'typeorm';
import { ApiLogsService } from '../../api-logs/api-logs.service.js';
import { trackApiCall } from '../../api-logs/track-api-call.js';
import { AnafConnection } from '../anaf-connection.entity.js';
import type { AnafEnvironment } from '../anaf-environment.js';
import { AnafOAuthService } from './anaf-oauth.service.js';

export interface AnafRequest {
  accountantId: number;
  connectionId: number;
  path: string;
  service: string;
  method?: Method;
  params?: Record<string, string | number>;
  data?: unknown;
  headers?: Record<string, string>;
  responseType?: ResponseType;
  companyId?: number;
  baseUrl?: string;
  allowStatuses?: number[];
}

export const PERMISSION_DENIAL_MEMORY_MS = 60 * 60 * 1000;

@Injectable()
export class AnafApiService {
  constructor(
    private readonly config: ConfigService,
    private readonly http: HttpService,
    private readonly oauth: AnafOAuthService,
    private readonly apiLogs: ApiLogsService,
    @InjectRepository(AnafConnection)
    private readonly connections: Repository<AnafConnection>,
  ) {}

  environment(): AnafEnvironment {
    return this.config.getOrThrow<AnafEnvironment>('ANAF_ENV');
  }

  envPath(path: string, environment = this.environment()): string {
    return `/${environment}${path}`;
  }

  async request<T = unknown>(req: AnafRequest): Promise<AxiosResponse<T>> {
    const connection = await this.connections.findOne({
      select: { id: true, deniedWithFreshTokenAt: true },
      where: { id: req.connectionId, accountantId: req.accountantId },
    });
    if (!connection) throw new NotFoundException('Conexiune ANAF inexistentă');

    let token = await this.oauth.getAccessToken(req.connectionId);
    let res = await this.send<T>(req, token);
    if (this.tokenMayBeStale(connection, res.status)) {
      const refreshed = await this.oauth.getAccessToken(req.connectionId, {
        force: true,
      });
      if (refreshed !== token) {
        token = refreshed;
        res = await this.send<T>(req, token);
        if (res.status === 403) {
          await this.connections.update(req.connectionId, {
            deniedWithFreshTokenAt: new Date(),
          });
        }
      }
    }

    if (res.status === 429) {
      throw new HttpException(
        'Limita ANAF de 1000 de cereri/minut a fost depășită. Reîncercați în curând.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    if (res.status === 401 || res.status === 403) {
      throw new HttpException(
        'ANAF a refuzat accesul. Verificați că certificatul are drept SPV pentru acest serviciu și CUI.',
        HttpStatus.FORBIDDEN,
      );
    }
    if (req.allowStatuses?.includes(res.status)) return res;
    if (res.status >= 400) {
      throw new BadGatewayException(`ANAF a răspuns cu ${res.status}`);
    }
    return res;
  }

  private tokenMayBeStale(connection: AnafConnection, status: number): boolean {
    if (status === 401) return true;
    if (status !== 403) return false;
    const deniedAt = connection.deniedWithFreshTokenAt?.getTime();
    return (
      deniedAt === undefined ||
      Date.now() - deniedAt >= PERMISSION_DENIAL_MEMORY_MS
    );
  }

  private async send<T>(
    req: AnafRequest,
    token: string,
  ): Promise<AxiosResponse<T>> {
    const method = (req.method ?? 'GET').toUpperCase();
    return trackApiCall(
      this.apiLogs,
      {
        accountantId: req.accountantId,
        anafConnectionId: req.connectionId,
        companyId: req.companyId ?? null,
        service: req.service,
        method,
        endpoint: req.path,
      },
      async (outcome) => {
        try {
          const res = await this.http.axiosRef.request<T>({
            baseURL:
              req.baseUrl ??
              this.config.getOrThrow<string>('ANAF_API_ENDPOINT'),
            url: req.path,
            method,
            params: req.params,
            data: req.data,
            responseType: req.responseType,
            headers: { ...req.headers, Authorization: `Bearer ${token}` },
            timeout: 60_000,
            validateStatus: () => true,
          });
          outcome.statusCode = res.status;
          if (res.status >= 400) outcome.error = `HTTP ${res.status}`;
          return res;
        } catch (err) {
          outcome.error = isAxiosError(err)
            ? (err.code ?? err.message)
            : String(err);
          throw new BadGatewayException('ANAF nu a putut fi contactat');
        }
      },
    );
  }
}
