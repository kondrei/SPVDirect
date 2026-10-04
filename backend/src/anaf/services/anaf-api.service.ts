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
import { AnafConnection } from '../anaf-connection.entity.js';
import { AnafOAuthService } from './anaf-oauth.service.js';

export interface AnafRequest {
  accountantId: number;
  connectionId: string;
  path: string;
  service: string;
  method?: Method;
  params?: Record<string, string | number>;
  data?: unknown;
  headers?: Record<string, string>;
  responseType?: ResponseType;
  companyId?: number;
  baseUrl?: string;
}

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

  envPath(path: string): string {
    return `/${this.config.getOrThrow<string>('ANAF_ENV')}${path}`;
  }

  async request<T = unknown>(req: AnafRequest): Promise<AxiosResponse<T>> {
    const owned = await this.connections.existsBy({
      id: req.connectionId,
      accountantId: req.accountantId,
    });
    if (!owned) throw new NotFoundException('Conexiune ANAF inexistentă');

    let token = await this.oauth.getAccessToken(req.connectionId);
    let res = await this.send<T>(req, token);
    if (res.status === 401 || res.status === 403) {
      const refreshed = await this.oauth.getAccessToken(req.connectionId, {
        force: true,
      });
      if (refreshed !== token) {
        token = refreshed;
        res = await this.send<T>(req, token);
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
    if (res.status >= 400) {
      throw new BadGatewayException(`ANAF a răspuns cu ${res.status}`);
    }
    return res;
  }

  private async send<T>(
    req: AnafRequest,
    token: string,
  ): Promise<AxiosResponse<T>> {
    const method = (req.method ?? 'GET').toUpperCase();
    const started = performance.now();
    let status: number | null = null;
    let error: string | null = null;
    try {
      const res = await this.http.axiosRef.request<T>({
        baseURL:
          req.baseUrl ?? this.config.getOrThrow<string>('ANAF_API_ENDPOINT'),
        url: req.path,
        method,
        params: req.params,
        data: req.data,
        responseType: req.responseType,
        headers: { ...req.headers, Authorization: `Bearer ${token}` },
        timeout: 60_000,
        validateStatus: () => true,
      });
      status = res.status;
      if (status >= 400) error = `HTTP ${status}`;
      return res;
    } catch (err) {
      error = isAxiosError(err) ? (err.code ?? err.message) : String(err);
      throw new BadGatewayException('ANAF nu a putut fi contactat');
    } finally {
      await this.apiLogs.record({
        accountantId: req.accountantId,
        anafConnectionId: req.connectionId,
        companyId: req.companyId ?? null,
        service: req.service,
        method,
        endpoint: req.path,
        statusCode: status,
        responseTimeMs: Math.round(performance.now() - started),
        error,
      });
    }
  }
}
