import { ServiceUnavailableException, Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { isAxiosError } from 'axios';
import { decodeAnafClaims } from '../anaf-jwt.js';

export interface AnafTokenSet {
  accessToken: string;
  refreshToken: string;
  accessExpiresAt: Date;
  refreshExpiresAt: Date;
  serial: string | null;
  roles: string[];
}

export type AnafTokenHint = 'access_token' | 'refresh_token';

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
    return {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    };
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
      throw new AnafTokenError(unreachable('token', err), false);
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

    const access = decodeAnafClaims(data.access_token);
    const refresh = decodeAnafClaims(refreshToken);
    const expiresInMs = Number(data.expires_in) * 1000;
    const accessExpiresAt =
      access.exp ??
      (expiresInMs > 0 ? new Date(Date.now() + expiresInMs) : null);
    if (!accessExpiresAt || !refresh.exp) {
      throw new AnafTokenError('ANAF token has no exp claim', false);
    }
    return {
      accessToken: data.access_token,
      refreshToken,
      accessExpiresAt,
      refreshExpiresAt: refresh.exp,
      serial: access.serial,
      roles: access.roles,
    };
  }
}
