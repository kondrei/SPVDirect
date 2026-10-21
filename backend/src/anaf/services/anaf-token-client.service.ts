import { ServiceUnavailableException, Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { isAxiosError } from 'axios';
import { decodeAnafClaims, describeTokenShape } from '../anaf-jwt.js';
import { ANAF_REFRESH_TOKEN_LIFETIME_MS } from '../../common/constants.js';
import {
  AnafGrantType,
  AnafTokenHint,
  AnafOAuthError,
} from '../dto/anaf.enums.js';

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

export class AnafTokenError extends ServiceUnavailableException {
  constructor(
    readonly detail: string,
    readonly invalidGrant: boolean,
  ) {
    super(
      'Serviciul de autorizare ANAF nu a răspuns corect. Reîncercați în 1 minut.',
    );
  }

  override toString(): string {
    return `AnafTokenError: ${this.detail}`;
  }
}

function unreachable(endpoint: string, err: unknown): string {
  return `ANAF ${endpoint} endpoint unreachable: ${isAxiosError(err) ? err.code : String(err)}`;
}

@Injectable()
export class AnafTokenClient {
  constructor(
    private readonly config: ConfigService,
    private readonly http: HttpService,
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
      grant_type: AnafGrantType.AuthorizationCode,
      code,
      redirect_uri: this.config.getOrThrow('ANAF_REDIRECT_URI'),
      token_content_type: 'jwt',
    });
  }

  refreshTokens(
    refreshToken: string,
    refreshExpiresAt: Date,
  ): Promise<AnafTokenSet> {
    return this.requestTokens(
      {
        grant_type: AnafGrantType.RefreshToken,
        refresh_token: refreshToken,
        token_content_type: 'jwt',
      },
      refreshExpiresAt,
    );
  }

  async revokeToken(token: string, hint: AnafTokenHint): Promise<void> {
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
          : unreachable('revoke', err),
        false,
      );
    }
  }

  private clientAuthHeaders(): Record<string, string> {
    const clientId = this.config.getOrThrow<string>('ANAF_CLIENT_ID');
    const clientSecret = this.config.getOrThrow<string>('ANAF_CLIENT_SECRET');
    const credentials = Buffer.from(`${clientId}:${clientSecret}`);
    return {
      Authorization: `Basic ${credentials.toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    };
  }

  private async requestTokens(
    form: Record<string, string>,
    currentRefreshExpiresAt?: Date,
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
          body?.error === AnafOAuthError.InvalidClient ||
          body?.error === AnafOAuthError.UnauthorizedClient;
        const invalidGrant =
          body?.error === AnafOAuthError.InvalidGrant ||
          (form.grant_type === AnafGrantType.RefreshToken &&
            !clientError &&
            err.response.status === 400);
        const reason = body?.error ? ` (${body.error})` : '';
        throw new AnafTokenError(
          `ANAF token endpoint returned ${err.response.status}${reason}`,
          invalidGrant,
        );
      }
      throw new AnafTokenError(unreachable('token', err), false);
    }
    return toTokenSet(data, form.refresh_token, currentRefreshExpiresAt);
  }
}

function toTokenSet(
  data: TokenResponse | undefined,
  previousRefreshToken: string | undefined,
  previousRefreshExpiresAt: Date | undefined,
): AnafTokenSet {
  if (!data?.access_token) {
    throw new AnafTokenError('ANAF token response has no access_token', false);
  }
  const refreshToken = data.refresh_token ?? previousRefreshToken;
  if (!refreshToken) {
    throw new AnafTokenError('ANAF token response has no refresh_token', false);
  }

  const access = decodeAnafClaims(data.access_token);
  const expiresInMs = Number(data.expires_in) * 1000;
  const accessExpiresAt =
    access.exp ?? (expiresInMs > 0 ? new Date(Date.now() + expiresInMs) : null);
  if (!accessExpiresAt) {
    const expiresIn = data.expires_in === undefined ? 'absent' : 'invalid';
    throw new AnafTokenError(
      `ANAF access_token has no exp claim (${describeTokenShape(data.access_token)}; expires_in ${expiresIn})`,
      false,
    );
  }
  const refreshExpiresAt =
    decodeAnafClaims(refreshToken).exp ??
    (data.refresh_token
      ? new Date(Date.now() + ANAF_REFRESH_TOKEN_LIFETIME_MS)
      : previousRefreshExpiresAt);
  if (!refreshExpiresAt) {
    throw new AnafTokenError(
      `ANAF refresh_token has no known expiry (${describeTokenShape(refreshToken)})`,
      false,
    );
  }
  return {
    accessToken: data.access_token,
    refreshToken,
    accessExpiresAt,
    refreshExpiresAt,
    serial: access.serial,
    roles: access.roles,
  };
}
