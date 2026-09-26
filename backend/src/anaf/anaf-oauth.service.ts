import {
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { isAxiosError } from 'axios';
import { Repository } from 'typeorm';
import { TokenCipher } from '../common/crypto/token-cipher.service.js';
import {
  AnafConnection,
  AnafConnectionSource,
} from './anaf-connection.entity.js';
import { decodeAnafClaims } from './anaf-jwt.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_ACCESS_TTL_MS = 90 * DAY_MS;
const DEFAULT_REFRESH_TTL_MS = 365 * DAY_MS;
export const TOKEN_COOLDOWN_MS = 60 * 1000;
const REFRESH_AT_LIFETIME_FRACTION = 0.9;

export interface AnafTokenSet {
  accessToken: string;
  refreshToken: string;
  accessExpiresAt: Date;
  refreshExpiresAt: Date;
  serial: string | null;
  roles: string[];
}

interface TokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number | string;
}

export class AnafTokenError extends Error {
  constructor(
    message: string,
    readonly invalidGrant: boolean,
  ) {
    super(message);
  }
}

@Injectable()
export class AnafOAuthService {
  private readonly logger = new Logger(AnafOAuthService.name);
  private readonly refreshes = new Map<string, Promise<string>>();
  private readonly lastTokenCalls = new Map<string, number>();
  private readonly lastRefreshes = new Map<string, number>();

  constructor(
    private readonly config: ConfigService,
    private readonly http: HttpService,
    private readonly cipher: TokenCipher,
    @InjectRepository(AnafConnection)
    private readonly connections: Repository<AnafConnection>,
  ) {}

  buildAuthorizeUrl(state: string): string {
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.config.getOrThrow('ANAF_CLIENT_ID'),
      redirect_uri: this.config.getOrThrow('ANAF_REDIRECT_URI'),
      token_content_type: 'jwt',
      state,
    });
    return `${this.config.getOrThrow<string>('ANAF_AUTH_ENDPOINT')}?${params}`;
  }

  exchangeCode(code: string): Promise<AnafTokenSet> {
    return this.requestTokens({
      grant_type: 'authorization_code',
      code,
      redirect_uri: this.config.getOrThrow('ANAF_REDIRECT_URI'),
      token_content_type: 'jwt',
    });
  }

  refreshTokens(refreshToken: string): Promise<AnafTokenSet> {
    return this.requestTokens({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      token_content_type: 'jwt',
    });
  }

  async revokeConnection(connectionId: string): Promise<boolean> {
    await this.connections.update(connectionId, { status: 'revoked' });
    await this.refreshes.get(connectionId)?.catch(() => undefined);

    const connection = await this.loadWithTokens(connectionId);
    const now = Date.now();
    if (connection.refreshExpiresAt.getTime() <= now) return true;
    try {
      await this.revokeToken(
        this.cipher.decrypt(connection.refreshTokenEnc),
        'refresh_token',
      );
      if (connection.accessExpiresAt.getTime() > now) {
        await this.revokeToken(
          this.cipher.decrypt(connection.accessTokenEnc),
          'access_token',
        );
      }
      return true;
    } catch (err) {
      this.logger.warn(
        `Revoking tokens failed for connection ${connectionId}: ${String(err)}`,
      );
      return false;
    }
  }

  async saveConnection(
    accountantId: string,
    tokens: AnafTokenSet,
    source: AnafConnectionSource,
  ): Promise<AnafConnection> {
    if (!tokens.serial) {
      throw new AnafTokenError(
        'Tokenul ANAF nu conține seria certificatului',
        false,
      );
    }
    const existing = await this.connections.findOneBy({
      accountantId,
      certSerial: tokens.serial,
    });
    const connection =
      existing ??
      this.connections.create({
        accountantId,
        certSerial: tokens.serial,
        label: `Certificat …${tokens.serial.replace(/[^0-9a-f]/gi, '').slice(-8)}`,
        source,
      });
    Object.assign(connection, {
      roles: tokens.roles,
      accessTokenEnc: this.cipher.encrypt(tokens.accessToken),
      refreshTokenEnc: this.cipher.encrypt(tokens.refreshToken),
      accessExpiresAt: tokens.accessExpiresAt,
      refreshExpiresAt: tokens.refreshExpiresAt,
      lastRefreshedAt: new Date(),
      status: 'active',
    });
    return this.connections.save(connection);
  }

  async getAccessToken(
    connectionId: string,
    { force = false }: { force?: boolean } = {},
  ): Promise<string> {
    let connection = await this.loadWithTokens(connectionId);
    if (
      (this.lastRefreshes.get(connectionId) ?? 0) >
      (connection.lastRefreshedAt?.getTime() ?? 0)
    ) {
      connection = await this.loadWithTokens(connectionId);
    }
    if (connection.status !== 'active') {
      throw new UnauthorizedException(
        'Conexiunea ANAF nu mai este activă. Reautorizați certificatul.',
      );
    }
    const now = Date.now();
    if (connection.refreshExpiresAt.getTime() <= now) {
      await this.connections.update(connectionId, { status: 'expired' });
      throw new UnauthorizedException(
        'Autorizarea ANAF a expirat. Reautorizați certificatul.',
      );
    }

    const accessValid = connection.accessExpiresAt.getTime() > now;
    const lastAttempt = Math.max(
      connection.lastRefreshedAt?.getTime() ?? 0,
      this.lastTokenCalls.get(connectionId) ?? 0,
    );
    const inCooldown = now - lastAttempt < TOKEN_COOLDOWN_MS;
    const canRefresh = !inCooldown || this.refreshes.has(connectionId);

    if ((force || this.nearExpiry(connection, now)) && canRefresh) {
      try {
        return await this.refreshOnce(connection);
      } catch (err) {
        if (!accessValid || force || err instanceof UnauthorizedException) {
          throw err;
        }
        this.logger.warn(
          `Proactive refresh failed for connection ${connectionId}: ${String(err)}`,
        );
      }
    }
    if (!accessValid) {
      throw new ServiceUnavailableException(
        'Tokenul ANAF a expirat și nu a putut fi reînnoit încă. Reîncercați în 1 minut.',
      );
    }
    return this.cipher.decrypt(connection.accessTokenEnc);
  }

  private nearExpiry(connection: AnafConnection, now: number): boolean {
    const issuedAt = (
      connection.lastRefreshedAt ?? connection.createdAt
    ).getTime();
    const lifetime = connection.accessExpiresAt.getTime() - issuedAt;
    return now >= issuedAt + lifetime * REFRESH_AT_LIFETIME_FRACTION;
  }

  private refreshOnce(connection: AnafConnection): Promise<string> {
    const inFlight = this.refreshes.get(connection.id);
    if (inFlight) return inFlight;

    const run = (async () => {
      this.lastTokenCalls.set(connection.id, Date.now());
      try {
        const tokens = await this.refreshTokens(
          this.cipher.decrypt(connection.refreshTokenEnc),
        );
        const refreshedAt = new Date();
        await this.connections.update(connection.id, {
          roles: tokens.roles.length ? tokens.roles : connection.roles,
          accessTokenEnc: this.cipher.encrypt(tokens.accessToken),
          refreshTokenEnc: this.cipher.encrypt(tokens.refreshToken),
          accessExpiresAt: tokens.accessExpiresAt,
          refreshExpiresAt: tokens.refreshExpiresAt,
          lastRefreshedAt: refreshedAt,
        });
        this.lastRefreshes.set(connection.id, refreshedAt.getTime());
        return tokens.accessToken;
      } catch (err) {
        if (err instanceof AnafTokenError && err.invalidGrant) {
          await this.connections.update(connection.id, { status: 'expired' });
          throw new UnauthorizedException(
            'ANAF a refuzat reînnoirea tokenului. Reautorizați certificatul.',
          );
        }
        throw err;
      } finally {
        this.refreshes.delete(connection.id);
      }
    })();
    this.refreshes.set(connection.id, run);
    return run;
  }

  private async loadWithTokens(id: string): Promise<AnafConnection> {
    const connection = await this.connections
      .createQueryBuilder('c')
      .addSelect(['c.accessTokenEnc', 'c.refreshTokenEnc'])
      .where('c.id = :id', { id })
      .getOne();
    if (!connection) throw new NotFoundException('Conexiune ANAF inexistentă');
    return connection;
  }

  private clientAuthHeaders(): Record<string, string> {
    const clientId = this.config.getOrThrow<string>('ANAF_CLIENT_ID');
    const clientSecret = this.config.getOrThrow<string>('ANAF_CLIENT_SECRET');
    return {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    };
  }

  private async revokeToken(
    token: string,
    hint: 'access_token' | 'refresh_token',
  ): Promise<void> {
    try {
      await this.http.axiosRef.post(
        this.config.getOrThrow('ANAF_REVOKE_ENDPOINT'),
        new URLSearchParams({ token, token_type_hint: hint }).toString(),
        { headers: this.clientAuthHeaders(), timeout: 30_000 },
      );
    } catch (err) {
      throw new AnafTokenError(
        isAxiosError(err) && err.response
          ? `ANAF revoke endpoint returned ${err.response.status}`
          : `ANAF revoke endpoint unreachable: ${isAxiosError(err) ? err.code : String(err)}`,
        false,
      );
    }
  }

  private async requestTokens(
    form: Record<string, string>,
  ): Promise<AnafTokenSet> {
    let data: TokenResponse;
    try {
      const res = await this.http.axiosRef.post<TokenResponse>(
        this.config.getOrThrow('ANAF_TOKEN_ENDPOINT'),
        new URLSearchParams(form).toString(),
        { headers: this.clientAuthHeaders(), timeout: 30_000 },
      );
      data = res.data;
    } catch (err) {
      if (isAxiosError(err) && err.response) {
        const body = err.response.data as { error?: string } | undefined;
        const clientError =
          body?.error === 'invalid_client' ||
          body?.error === 'unauthorized_client';
        const invalidGrant =
          body?.error === 'invalid_grant' ||
          (form.grant_type === 'refresh_token' &&
            !clientError &&
            err.response.status === 400);
        throw new AnafTokenError(
          `ANAF token endpoint returned ${err.response.status}${body?.error ? ` (${body.error})` : ''}`,
          invalidGrant,
        );
      }
      throw new AnafTokenError(
        `ANAF token endpoint unreachable: ${isAxiosError(err) ? err.code : String(err)}`,
        false,
      );
    }

    if (!data?.access_token) {
      throw new AnafTokenError(
        'ANAF token response has no access_token',
        false,
      );
    }
    const refreshToken = data.refresh_token ?? form.refresh_token;
    if (!refreshToken) {
      throw new AnafTokenError(
        'ANAF token response has no refresh_token',
        false,
      );
    }

    const now = Date.now();
    const access = decodeAnafClaims(data.access_token);
    const refresh = decodeAnafClaims(refreshToken);
    const expiresInMs = Number(data.expires_in) * 1000;
    return {
      accessToken: data.access_token,
      refreshToken,
      accessExpiresAt:
        access.exp ??
        new Date(now + (expiresInMs > 0 ? expiresInMs : DEFAULT_ACCESS_TTL_MS)),
      refreshExpiresAt: refresh.exp ?? new Date(now + DEFAULT_REFRESH_TTL_MS),
      serial: access.serial,
      roles: access.roles,
    };
  }
}
