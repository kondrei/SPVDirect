import {
  BadGatewayException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { setTimeout as sleep } from 'node:timers/promises';
import { Repository } from 'typeorm';
import { TokenCipher } from '../../common/crypto/token-cipher.service.js';
import {
  AnafConnection,
  AnafConnectionSource,
} from '../anaf-connection.entity.js';
import {
  AnafTokenClient,
  AnafTokenError,
  type AnafTokenSet,
} from './anaf-token-client.service.js';

export const TOKEN_COOLDOWN_MS = 60 * 1000;
export const REFRESH_LEASE_MS = 90 * 1000;
export const REFRESH_POLL_MS = 500;
const REFRESH_AT_LIFETIME_FRACTION = 0.9;

@Injectable()
export class AnafOAuthService {
  private readonly logger = new Logger(AnafOAuthService.name);
  private readonly inFlightRefreshes = new Map<
    string,
    Promise<string | null>
  >();

  constructor(
    private readonly tokens: AnafTokenClient,
    private readonly cipher: TokenCipher,
    @InjectRepository(AnafConnection)
    private readonly connections: Repository<AnafConnection>,
  ) {}

  async revokeConnection(connectionId: string): Promise<boolean> {
    await this.connections.update(connectionId, { status: 'revoked' });
    await this.inFlightRefreshes.get(connectionId)?.catch(() => undefined);

    const connection = await this.waitForRefreshEnd(connectionId);
    const now = Date.now();
    if (connection.refreshExpiresAt.getTime() <= now) return true;
    await this.connections.update(connectionId, { tokenCallAt: new Date(now) });
    try {
      await this.tokens.revokeToken(
        this.cipher.decrypt(connection.refreshTokenEnc),
        'refresh_token',
      );
      if (connection.accessExpiresAt.getTime() > now) {
        await this.tokens.revokeToken(
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
    accountantId: number,
    tokens: AnafTokenSet,
    source: AnafConnectionSource,
  ): Promise<AnafConnection> {
    if (!tokens.serial) {
      throw new BadGatewayException(
        'Tokenul ANAF nu conține seria certificatului',
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
    const now = new Date();
    Object.assign(connection, {
      roles: tokens.roles,
      accessTokenEnc: this.cipher.encrypt(tokens.accessToken),
      refreshTokenEnc: this.cipher.encrypt(tokens.refreshToken),
      accessExpiresAt: tokens.accessExpiresAt,
      refreshExpiresAt: tokens.refreshExpiresAt,
      lastRefreshedAt: now,
      tokenCallAt: now,
      deniedWithFreshTokenAt: null,
      status: 'active',
    });
    return this.connections.save(connection);
  }

  async getAccessToken(
    connectionId: string,
    { force = false }: { force?: boolean } = {},
  ): Promise<string> {
    const connection = await this.loadWithTokens(connectionId);
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
    if (
      (force || this.nearExpiry(connection, now)) &&
      this.canRefresh(connection, now)
    ) {
      try {
        const refreshed = await this.refreshOnce(connection);
        if (refreshed) return refreshed;
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

  private canRefresh(connection: AnafConnection, now: number): boolean {
    if (this.inFlightRefreshes.has(connection.id)) return true;
    if (this.refreshRunning(connection, now)) return true;
    const lastCall = Math.max(
      connection.lastRefreshedAt?.getTime() ?? 0,
      connection.tokenCallAt?.getTime() ?? 0,
    );
    return now - lastCall >= TOKEN_COOLDOWN_MS;
  }

  private refreshRunning(connection: AnafConnection, now: number): boolean {
    const startedAt = connection.refreshStartedAt?.getTime();
    return startedAt !== undefined && now - startedAt < REFRESH_LEASE_MS;
  }

  private nearExpiry(connection: AnafConnection, now: number): boolean {
    const issuedAt = (
      connection.lastRefreshedAt ?? connection.createdAt
    ).getTime();
    const lifetime = connection.accessExpiresAt.getTime() - issuedAt;
    return now >= issuedAt + lifetime * REFRESH_AT_LIFETIME_FRACTION;
  }

  private refreshOnce(connection: AnafConnection): Promise<string | null> {
    const inFlight = this.inFlightRefreshes.get(connection.id);
    if (inFlight) return inFlight;

    const run = (async () => {
      try {
        if (!(await this.claimRefresh(connection.id))) {
          return await this.awaitOtherRefresh(connection);
        }
        return await this.refresh(connection.id);
      } finally {
        this.inFlightRefreshes.delete(connection.id);
      }
    })();
    this.inFlightRefreshes.set(connection.id, run);
    return run;
  }

  private async claimRefresh(connectionId: string): Promise<boolean> {
    const now = Date.now();
    const result = await this.connections
      .createQueryBuilder()
      .update(AnafConnection)
      .set({ tokenCallAt: new Date(now), refreshStartedAt: new Date(now) })
      .where('id = :id', { id: connectionId })
      .andWhere(`status = 'active'`)
      .andWhere(
        `COALESCE(GREATEST(token_call_at, last_refreshed_at), '-infinity') <= :cooldownCutoff`,
        { cooldownCutoff: new Date(now - TOKEN_COOLDOWN_MS) },
      )
      .andWhere(
        `(refresh_started_at IS NULL OR refresh_started_at <= :leaseCutoff)`,
        { leaseCutoff: new Date(now - REFRESH_LEASE_MS) },
      )
      .execute();
    return result.affected === 1;
  }

  private async refresh(connectionId: string): Promise<string> {
    const connection = await this.loadWithTokens(connectionId);
    try {
      const tokens = await this.tokens.refreshTokens(
        this.cipher.decrypt(connection.refreshTokenEnc),
      );
      await this.connections.update(connectionId, {
        roles: tokens.roles.length ? tokens.roles : connection.roles,
        accessTokenEnc: this.cipher.encrypt(tokens.accessToken),
        refreshTokenEnc: this.cipher.encrypt(tokens.refreshToken),
        accessExpiresAt: tokens.accessExpiresAt,
        refreshExpiresAt: tokens.refreshExpiresAt,
        lastRefreshedAt: new Date(),
        refreshStartedAt: null,
      });
      return tokens.accessToken;
    } catch (err) {
      if (err instanceof AnafTokenError && err.invalidGrant) {
        await this.connections.update(connectionId, {
          status: 'expired',
          refreshStartedAt: null,
        });
        throw new UnauthorizedException(
          'ANAF a refuzat reînnoirea tokenului. Reautorizați certificatul.',
        );
      }
      await this.connections
        .update(connectionId, { refreshStartedAt: null })
        .catch((releaseErr: unknown) =>
          this.logger.warn(
            `Releasing the refresh of connection ${connectionId} failed: ${String(releaseErr)}`,
          ),
        );
      throw err;
    }
  }

  private async awaitOtherRefresh(
    seen: AnafConnection,
  ): Promise<string | null> {
    const current = await this.waitForRefreshEnd(seen.id);
    if (current.status !== 'active') {
      throw new UnauthorizedException(
        'Conexiunea ANAF nu mai este activă. Reautorizați certificatul.',
      );
    }
    const refreshedSince =
      (current.lastRefreshedAt?.getTime() ?? 0) >
      (seen.lastRefreshedAt?.getTime() ?? 0);
    return refreshedSince && current.accessExpiresAt.getTime() > Date.now()
      ? this.cipher.decrypt(current.accessTokenEnc)
      : null;
  }

  private async waitForRefreshEnd(
    connectionId: string,
  ): Promise<AnafConnection> {
    const deadline = Date.now() + REFRESH_LEASE_MS;
    for (;;) {
      const connection = await this.loadWithTokens(connectionId);
      const now = Date.now();
      if (!this.refreshRunning(connection, now) || now >= deadline) {
        return connection;
      }
      await sleep(REFRESH_POLL_MS);
    }
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
}
