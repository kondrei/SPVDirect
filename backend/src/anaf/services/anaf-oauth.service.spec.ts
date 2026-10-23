import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { HttpService } from '@nestjs/axios';
import type { Repository } from 'typeorm';
import { randomBytes } from 'node:crypto';
import { TokenCipher } from '../../common/crypto/token-cipher.service.js';
import type { AnafConnection } from '../anaf-connection.entity.js';
import { AnafOAuthService, REFRESH_LEASE_MS } from './anaf-oauth.service.js';
import {
  AnafTokenClient,
  AnafTokenError,
} from './anaf-token-client.service.js';
import { fakeAnafJwt } from '../../testing/fake-anaf-jwt.js';
import { AnafConnectionSource } from '../dto/anaf.enums.js';
import { AnafConnectionRepository } from '../repositories/anaf-connection.repository.js';

const env = {
  ANAF_CLIENT_ID: 'client-id',
  ANAF_CLIENT_SECRET: 'client-secret',
  ANAF_REDIRECT_URI: 'http://localhost:3000/anaf/callback',
  ANAF_AUTH_ENDPOINT: 'https://logincert.anaf.ro/anaf-oauth2/v1/authorize',
  ANAF_TOKEN_ENDPOINT: 'https://logincert.anaf.ro/anaf-oauth2/v1/token',
  ANAF_REVOKE_ENDPOINT: 'https://logincert.anaf.ro/anaf-oauth2/v1/revoke',
  TOKEN_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
};

function setup(connection?: Partial<AnafConnection>) {
  const config = new ConfigService(env);
  const cipher = new TokenCipher(config);
  const post = vi.fn();
  const http = { axiosRef: { post } } as unknown as HttpService;

  const stored: AnafConnection = {
    id: 7,
    accountantId: 1,
    status: 'active',
    roles: ['HELLO'],
    accessTokenEnc: cipher.encrypt('old-access'),
    refreshTokenEnc: cipher.encrypt('old-refresh'),
    accessExpiresAt: new Date(Date.now() + 60 * 1000),
    refreshExpiresAt: new Date(Date.now() + 300 * 24 * 3600 * 1000),
    lastRefreshedAt: new Date(Date.now() - 90 * 24 * 3600 * 1000),
    createdAt: new Date(Date.now() - 90 * 24 * 3600 * 1000),
    ...connection,
  } as AnafConnection;

  const update = vi.fn((_id: number, values: Partial<AnafConnection>) => {
    Object.assign(stored, values);
    return Promise.resolve({ affected: 1 });
  });
  const save = vi.fn((c: AnafConnection) => {
    Object.assign(stored, c, { id: 7 });
    return Promise.resolve(structuredClone(stored));
  });
  const getOne = vi.fn(() => Promise.resolve(structuredClone(stored)));
  const claimUpdate = () => {
    let values: Partial<AnafConnection> = {};
    const params: Record<string, Date> = {};
    const builder = {
      update: () => builder,
      set(v: Partial<AnafConnection>) {
        values = v;
        return builder;
      },
      where: () => builder,
      andWhere(_sql: string, p?: Record<string, Date>) {
        Object.assign(params, p);
        return builder;
      },
      execute() {
        const lastCall = Math.max(
          stored.tokenCallAt?.getTime() ?? Number.NEGATIVE_INFINITY,
          stored.lastRefreshedAt?.getTime() ?? Number.NEGATIVE_INFINITY,
        );
        const claimed =
          stored.status === 'active' &&
          lastCall <= params.cooldownCutoff.getTime() &&
          (!stored.refreshStartedAt ||
            stored.refreshStartedAt <= params.leaseCutoff);
        if (claimed) Object.assign(stored, values);
        return Promise.resolve({ affected: claimed ? 1 : 0 });
      },
    };
    return builder;
  };
  const repo = {
    update,
    save,
    findOneBy: vi.fn().mockResolvedValue(null),
    create: (c: object) => ({ ...c }),
    createQueryBuilder: (alias?: string) =>
      alias
        ? {
            addSelect() {
              return this;
            },
            where() {
              return this;
            },
            getOne,
          }
        : claimUpdate(),
  } as unknown as Repository<AnafConnection>;

  const client = new AnafTokenClient(config, http);
  const instance = () =>
    new AnafOAuthService(client, cipher, new AnafConnectionRepository(repo));
  const service = instance();
  return { service, instance, client, post, update, getOne, stored, cipher };
}

function deferred() {
  let resolve!: (v: unknown) => void;
  const promise = new Promise((r) => (resolve = r));
  return { promise, resolve };
}

const tick = () => new Promise((r) => setTimeout(r, 50));

describe('AnafOAuthService', () => {
  it('builds the authorize URL per the ANAF procedure', () => {
    const url = new URL(setup().client.buildAuthorizeUrl('st4te'));
    expect(url.origin + url.pathname).toBe(env.ANAF_AUTH_ENDPOINT);
    expect(Object.fromEntries(url.searchParams)).toEqual({
      response_type: 'code',
      client_id: 'client-id',
      redirect_uri: env.ANAF_REDIRECT_URI,
      token_content_type: 'jwt',
      state: 'st4te',
    });
    expect(url.searchParams.has('scope')).toBe(false);
  });

  it('exchanges the code with Basic auth and a form body without the secret', async () => {
    const { client, post } = setup();
    const access = fakeAnafJwt();
    post.mockResolvedValue({
      data: { access_token: access, refresh_token: fakeAnafJwt() },
    });

    const tokens = await client.exchangeCode('the-code');

    const [url, body, options] = post.mock.calls[0];
    expect(url).toBe(env.ANAF_TOKEN_ENDPOINT);
    expect(Object.fromEntries(new URLSearchParams(body))).toEqual({
      grant_type: 'authorization_code',
      code: 'the-code',
      redirect_uri: env.ANAF_REDIRECT_URI,
      token_content_type: 'jwt',
    });
    expect(options.headers.Authorization).toBe(
      `Basic ${Buffer.from('client-id:client-secret').toString('base64')}`,
    );
    expect(body).not.toContain('client-secret');
    expect(tokens.accessToken).toBe(access);
    expect(tokens.serial).toBe('34:00:00:25:69:aa:bb:cc:dd:00:25:69');
    expect(tokens.roles).toContain('EFACTURA');
  });

  it('shares one token call between concurrent refreshes and stores both new tokens', async () => {
    const { service, post, update, cipher } = setup();
    const newAccess = fakeAnafJwt();
    const newRefresh = fakeAnafJwt({}, { expInSeconds: 365 * 24 * 3600 });
    let resolve!: (v: unknown) => void;
    post.mockReturnValue(new Promise((r) => (resolve = r)));

    const calls = [service.getAccessToken(7), service.getAccessToken(7)];
    await vi.waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    resolve({ data: { access_token: newAccess, refresh_token: newRefresh } });

    await expect(Promise.all(calls)).resolves.toEqual([newAccess, newAccess]);
    expect(post).toHaveBeenCalledTimes(1);
    const saved = update.mock.calls[0][1];
    expect(cipher.decrypt(String(saved.accessTokenEnc))).toBe(newAccess);
    expect(cipher.decrypt(String(saved.refreshTokenEnc))).toBe(newRefresh);
  });

  it('does not refresh again from a stale row right after a successful refresh', async () => {
    const { service, post, getOne, stored } = setup();
    const newAccess = fakeAnafJwt();
    post.mockResolvedValue({
      data: { access_token: newAccess, refresh_token: fakeAnafJwt() },
    });
    const stale = structuredClone(stored);

    await expect(service.getAccessToken(7)).resolves.toBe(newAccess);
    getOne.mockResolvedValueOnce(stale);

    await expect(service.getAccessToken(7, { force: true })).resolves.toBe(
      newAccess,
    );
    expect(post).toHaveBeenCalledTimes(1);
  });

  it('does not expire the connection on a bare 401 from the token endpoint', async () => {
    const { service, post, stored } = setup({
      accessExpiresAt: new Date(Date.now() - 1000),
    });
    post.mockRejectedValue(
      Object.assign(new Error('401'), {
        isAxiosError: true,
        response: { status: 401, data: undefined },
      }),
    );

    await expect(service.getAccessToken(7)).rejects.toMatchObject({
      detail: expect.stringMatching(/401/),
    });
    expect(stored.status).toBe('active');
    expect(stored.refreshStartedAt).toBeNull();
  });

  it('does not expire the connection when ANAF rejects our client credentials', async () => {
    const { service, post, stored } = setup({
      accessExpiresAt: new Date(Date.now() - 1000),
    });
    post.mockRejectedValue(
      Object.assign(new Error('401'), {
        isAxiosError: true,
        response: { status: 401, data: { error: 'invalid_client' } },
      }),
    );

    await expect(service.getAccessToken(7)).rejects.toMatchObject({
      detail: expect.stringMatching(/invalid_client/),
    });
    expect(stored.status).toBe('active');
  });

  it('does not call the token endpoint within the 60 s cooldown', async () => {
    const { service, post } = setup({
      lastRefreshedAt: new Date(Date.now() - 10 * 1000),
    });
    await expect(service.getAccessToken(7, { force: true })).resolves.toBe(
      'old-access',
    );
    expect(post).not.toHaveBeenCalled();
  });

  it('does not refresh a token that is far from expiry', async () => {
    const { service, post } = setup({
      accessExpiresAt: new Date(Date.now() + 80 * 24 * 3600 * 1000),
      lastRefreshedAt: new Date(Date.now() - 10 * 24 * 3600 * 1000),
    });
    await expect(service.getAccessToken(7)).resolves.toBe('old-access');
    expect(post).not.toHaveBeenCalled();
  });

  it('keeps using a valid token after a transient refresh failure, then cools down', async () => {
    const { service, post, update } = setup();
    post.mockRejectedValue(new Error('ECONNRESET'));

    await expect(service.getAccessToken(7)).resolves.toBe('old-access');
    await expect(service.getAccessToken(7)).resolves.toBe('old-access');

    expect(post).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith(7, { refreshStartedAt: null });
  });

  it('marks the connection expired when ANAF rejects the refresh token', async () => {
    const { service, post, update } = setup();
    post.mockRejectedValue(
      Object.assign(new Error('400'), {
        isAxiosError: true,
        response: { status: 400, data: { error: 'invalid_grant' } },
      }),
    );
    await expect(service.getAccessToken(7)).rejects.toThrow(/Reautorizați/);
    expect(update).toHaveBeenCalledWith(7, {
      status: 'expired',
      refreshStartedAt: null,
    });
  });

  it('answers 503 with a Romanian message when the token endpoint is unreachable', async () => {
    const { service, post } = setup({
      accessExpiresAt: new Date(Date.now() - 1000),
    });
    post.mockRejectedValue(
      Object.assign(new Error('timeout'), {
        isAxiosError: true,
        code: 'ECONNABORTED',
      }),
    );
    const err = await service.getAccessToken(7).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AnafTokenError);
    expect((err as AnafTokenError).getStatus()).toBe(503);
    expect((err as AnafTokenError).message).toMatch(/Reîncercați/);
    expect(String(err)).toContain('ECONNABORTED');
  });

  it('rejects a token response whose tokens carry no exp claim', async () => {
    const { client, post } = setup();
    post.mockResolvedValue({
      data: {
        access_token: fakeAnafJwt({ exp: undefined }),
        refresh_token: fakeAnafJwt({ exp: undefined }),
      },
    });
    await expect(client.exchangeCode('c')).rejects.toMatchObject({
      detail: expect.stringMatching(/exp/),
    });
  });

  it('describes an access token without exp and never echoes it', async () => {
    const { client, post } = setup();
    post.mockResolvedValue({
      data: {
        access_token: 'opaque.access-secret',
        refresh_token: fakeAnafJwt(),
      },
    });
    const err = (await client
      .exchangeCode('c')
      .catch((e: unknown) => e)) as AnafTokenError;
    expect(err.detail).toContain('access_token has no exp claim (opaque, 2');
    expect(err.detail).toContain('expires_in absent');
    expect(err.detail).not.toContain('access-secret');
  });

  it('gives an opaque refresh token the 365 days ANAF documents', async () => {
    const { client, post } = setup();
    post.mockResolvedValue({
      data: { access_token: fakeAnafJwt(), refresh_token: 'opaque-refresh' },
    });
    const tokens = await client.exchangeCode('c');
    const days =
      (tokens.refreshExpiresAt.getTime() - Date.now()) / (24 * 3600 * 1000);
    expect(days).toBeCloseTo(365, 2);
  });

  it('keeps the stored expiry when a refresh reuses an opaque refresh token', async () => {
    const { client, post } = setup();
    post.mockResolvedValue({ data: { access_token: fakeAnafJwt() } });
    const current = new Date(Date.now() + 100 * 24 * 3600 * 1000);
    const tokens = await client.refreshTokens('opaque-refresh', current);
    expect(tokens.refreshToken).toBe('opaque-refresh');
    expect(tokens.refreshExpiresAt).toEqual(current);
  });

  it('prefers the refresh token exp claim when it is a JWT', async () => {
    const { client, post } = setup();
    post.mockResolvedValue({
      data: {
        access_token: fakeAnafJwt(),
        refresh_token: fakeAnafJwt({ exp: 1705509635 }),
      },
    });
    const tokens = await client.exchangeCode('c');
    expect(tokens.refreshExpiresAt.toISOString()).toBe(
      '2024-01-17T16:40:35.000Z',
    );
  });

  it('uses expires_in from ANAF when the access token has no exp', async () => {
    const { client, post } = setup();
    post.mockResolvedValue({
      data: {
        access_token: fakeAnafJwt({ exp: undefined }),
        refresh_token: fakeAnafJwt(),
        expires_in: 3600,
      },
    });
    const tokens = await client.exchangeCode('c');
    expect(tokens.accessExpiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('does not refresh right after a new connection was saved', async () => {
    const { service, post } = setup();
    const saved = await service.saveConnection(
      1,
      {
        accessToken: 'a',
        refreshToken: 'r',
        accessExpiresAt: new Date(Date.now() + 1000),
        refreshExpiresAt: new Date(Date.now() + 1e9),
        serial: 'ab:cd',
        roles: [],
      },
      AnafConnectionSource.Self,
    );
    expect(saved.id).toBe(7);
    expect(saved.deniedWithFreshTokenAt).toBeNull();
    await service.getAccessToken(7, { force: true });
    expect(post).not.toHaveBeenCalled();
  });

  describe('across instances', () => {
    it('lets one instance refresh while the other waits for its tokens', async () => {
      const { service, instance, post, stored, cipher } = setup();
      const pending = deferred();
      post.mockReturnValue(pending.promise);
      const newAccess = fakeAnafJwt();
      const newRefresh = fakeAnafJwt();

      const first = service.getAccessToken(7);
      await vi.waitFor(() => expect(post).toHaveBeenCalledTimes(1));
      const second = instance().getAccessToken(7, { force: true });
      await tick();
      pending.resolve({
        data: { access_token: newAccess, refresh_token: newRefresh },
      });

      await expect(Promise.all([first, second])).resolves.toEqual([
        newAccess,
        newAccess,
      ]);
      expect(post).toHaveBeenCalledTimes(1);
      expect(cipher.decrypt(stored.refreshTokenEnc)).toBe(newRefresh);
      expect(stored.refreshStartedAt).toBeNull();
    });

    it('shares the token endpoint cooldown after a failed refresh', async () => {
      const { service, instance, post } = setup();
      post.mockRejectedValue(new Error('ECONNRESET'));

      await expect(service.getAccessToken(7)).resolves.toBe('old-access');
      await expect(instance().getAccessToken(7, { force: true })).resolves.toBe(
        'old-access',
      );
      expect(post).toHaveBeenCalledTimes(1);
    });

    it('fails the waiting instance when ANAF rejects the refresh token on the other', async () => {
      const { service, instance, post } = setup();
      const pending = deferred();
      post.mockReturnValue(pending.promise);

      const first = service.getAccessToken(7).catch((e: unknown) => e);
      await vi.waitFor(() => expect(post).toHaveBeenCalledTimes(1));
      const second = instance()
        .getAccessToken(7, { force: true })
        .catch((e: unknown) => e);
      await tick();
      pending.resolve(
        Promise.reject(
          Object.assign(new Error('400'), {
            isAxiosError: true,
            response: { status: 400, data: { error: 'invalid_grant' } },
          }),
        ),
      );

      await expect(first).resolves.toBeInstanceOf(UnauthorizedException);
      await expect(second).resolves.toBeInstanceOf(UnauthorizedException);
      expect(post).toHaveBeenCalledTimes(1);
    });

    it('takes over a refresh whose instance died before releasing it', async () => {
      const abandoned = new Date(Date.now() - REFRESH_LEASE_MS - 1000);
      const { service, post, stored } = setup({
        tokenCallAt: abandoned,
        refreshStartedAt: abandoned,
      });
      const newAccess = fakeAnafJwt();
      post.mockResolvedValue({
        data: { access_token: newAccess, refresh_token: fakeAnafJwt() },
      });

      await expect(service.getAccessToken(7)).resolves.toBe(newAccess);
      expect(stored.refreshStartedAt).toBeNull();
    });
  });

  describe('revokeConnection', () => {
    it('revokes the refresh and access tokens with Basic auth', async () => {
      const { service, post, update } = setup();
      post.mockResolvedValue({ status: 200, data: '' });

      await expect(service.revokeConnection(7)).resolves.toBe(true);

      expect(update).toHaveBeenCalledWith(7, { status: 'revoked' });
      expect(post).toHaveBeenCalledTimes(2);
      const forms = post.mock.calls.map(([url, body, options]) => {
        expect(url).toBe(env.ANAF_REVOKE_ENDPOINT);
        expect(body).not.toContain('client-secret');
        expect(options.headers.Authorization).toBe(
          `Basic ${Buffer.from('client-id:client-secret').toString('base64')}`,
        );
        return Object.fromEntries(new URLSearchParams(body));
      });
      expect(forms).toEqual([
        { token: 'old-refresh', token_type_hint: 'refresh_token' },
        { token: 'old-access', token_type_hint: 'access_token' },
      ]);
    });

    it('revokes the rotated token when a refresh is in flight', async () => {
      const { service, post } = setup();
      const pending = deferred();
      post.mockReturnValueOnce(pending.promise);
      post.mockResolvedValue({ status: 200, data: '' });

      const access = service.getAccessToken(7);
      await vi.waitFor(() => expect(post).toHaveBeenCalledTimes(1));
      const revoke = service.revokeConnection(7);
      const newRefresh = fakeAnafJwt();
      pending.resolve({
        data: { access_token: fakeAnafJwt(), refresh_token: newRefresh },
      });

      await expect(access).resolves.toBeTruthy();
      await expect(revoke).resolves.toBe(true);
      expect(new URLSearchParams(post.mock.calls[1][1]).get('token')).toBe(
        newRefresh,
      );
    });

    it('waits for a refresh running on another instance and revokes its new token', async () => {
      const { service, instance, post } = setup();
      const pending = deferred();
      post.mockReturnValueOnce(pending.promise);
      post.mockResolvedValue({ status: 200, data: '' });

      const access = service.getAccessToken(7);
      await vi.waitFor(() => expect(post).toHaveBeenCalledTimes(1));
      const revoke = instance().revokeConnection(7);
      await tick();
      expect(post).toHaveBeenCalledTimes(1);
      const newRefresh = fakeAnafJwt();
      pending.resolve({
        data: { access_token: fakeAnafJwt(), refresh_token: newRefresh },
      });

      await expect(access).resolves.toBeTruthy();
      await expect(revoke).resolves.toBe(true);
      expect(new URLSearchParams(post.mock.calls[1][1]).get('token')).toBe(
        newRefresh,
      );
    });

    it('skips the access token once it has expired', async () => {
      const { service, post } = setup({
        accessExpiresAt: new Date(Date.now() - 1000),
      });
      post.mockResolvedValue({ status: 200, data: '' });

      await service.revokeConnection(7);

      expect(post).toHaveBeenCalledTimes(1);
      expect(new URLSearchParams(post.mock.calls[0][1]).get('token')).toBe(
        'old-refresh',
      );
    });

    it('does not call ANAF when the refresh token has expired', async () => {
      const { service, post } = setup({
        refreshExpiresAt: new Date(Date.now() - 1000),
      });

      await expect(service.revokeConnection(7)).resolves.toBe(true);
      expect(post).not.toHaveBeenCalled();
    });

    it('returns false instead of throwing when ANAF fails', async () => {
      const { service, post } = setup();
      post.mockRejectedValue(
        Object.assign(new Error('503'), {
          isAxiosError: true,
          response: { status: 503, data: {} },
        }),
      );

      await expect(service.revokeConnection(7)).resolves.toBe(false);
    });
  });
});
