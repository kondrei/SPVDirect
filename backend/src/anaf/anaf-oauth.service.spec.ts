import { ConfigService } from '@nestjs/config';
import type { HttpService } from '@nestjs/axios';
import type { Repository } from 'typeorm';
import { randomBytes } from 'node:crypto';
import { TokenCipher } from '../common/crypto/token-cipher.service.js';
import type { AnafConnection } from './anaf-connection.entity.js';
import { AnafOAuthService } from './anaf-oauth.service.js';
import { fakeAnafJwt } from '../testing/fake-anaf-jwt.js';

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
    id: 'conn-1',
    accountantId: 'acc-1',
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

  const update = vi.fn().mockResolvedValue({ affected: 1 });
  const getOne = vi.fn(() => Promise.resolve(structuredClone(stored)));
  const repo = {
    update,
    createQueryBuilder: () => ({
      addSelect() {
        return this;
      },
      where() {
        return this;
      },
      getOne,
    }),
  } as unknown as Repository<AnafConnection>;

  const service = new AnafOAuthService(config, http, cipher, repo);
  return { service, post, update, getOne, stored, cipher };
}

describe('AnafOAuthService', () => {
  it('builds the authorize URL per the ANAF procedure', () => {
    const url = new URL(setup().service.buildAuthorizeUrl('st4te'));
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
    const { service, post } = setup();
    const access = fakeAnafJwt();
    post.mockResolvedValue({
      data: { access_token: access, refresh_token: fakeAnafJwt() },
    });

    const tokens = await service.exchangeCode('the-code');

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

    const calls = [
      service.getAccessToken('conn-1'),
      service.getAccessToken('conn-1'),
    ];
    await vi.waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    resolve({ data: { access_token: newAccess, refresh_token: newRefresh } });

    await expect(Promise.all(calls)).resolves.toEqual([newAccess, newAccess]);
    expect(post).toHaveBeenCalledTimes(1);
    const saved = update.mock.calls[0][1];
    expect(cipher.decrypt(saved.accessTokenEnc)).toBe(newAccess);
    expect(cipher.decrypt(saved.refreshTokenEnc)).toBe(newRefresh);
  });

  it('does not refresh again from a stale row right after a successful refresh', async () => {
    const { service, post, update, getOne, stored } = setup();
    const newAccess = fakeAnafJwt();
    post.mockResolvedValue({
      data: { access_token: newAccess, refresh_token: fakeAnafJwt() },
    });

    await expect(service.getAccessToken('conn-1')).resolves.toBe(newAccess);
    const saved = Object.assign(
      structuredClone(stored),
      update.mock.calls[0][1],
    );
    getOne
      .mockResolvedValueOnce(structuredClone(stored))
      .mockResolvedValueOnce(saved);

    await expect(
      service.getAccessToken('conn-1', { force: true }),
    ).resolves.toBe(newAccess);
    expect(post).toHaveBeenCalledTimes(1);
  });

  it('does not expire the connection on a bare 401 from the token endpoint', async () => {
    const { service, post, update } = setup({
      accessExpiresAt: new Date(Date.now() - 1000),
    });
    post.mockRejectedValue(
      Object.assign(new Error('401'), {
        isAxiosError: true,
        response: { status: 401, data: undefined },
      }),
    );

    await expect(service.getAccessToken('conn-1')).rejects.toThrow(/401/);
    expect(update).not.toHaveBeenCalledWith('conn-1', { status: 'expired' });
  });

  it('does not expire the connection when ANAF rejects our client credentials', async () => {
    const { service, post, update } = setup({
      accessExpiresAt: new Date(Date.now() - 1000),
    });
    post.mockRejectedValue(
      Object.assign(new Error('401'), {
        isAxiosError: true,
        response: { status: 401, data: { error: 'invalid_client' } },
      }),
    );

    await expect(service.getAccessToken('conn-1')).rejects.toThrow(
      /invalid_client/,
    );
    expect(update).not.toHaveBeenCalledWith('conn-1', { status: 'expired' });
  });

  it('does not call the token endpoint within the 60 s cooldown', async () => {
    const { service, post } = setup({
      lastRefreshedAt: new Date(Date.now() - 10 * 1000),
    });
    await expect(
      service.getAccessToken('conn-1', { force: true }),
    ).resolves.toBe('old-access');
    expect(post).not.toHaveBeenCalled();
  });

  it('does not refresh a token that is far from expiry', async () => {
    const { service, post } = setup({
      accessExpiresAt: new Date(Date.now() + 80 * 24 * 3600 * 1000),
      lastRefreshedAt: new Date(Date.now() - 10 * 24 * 3600 * 1000),
    });
    await expect(service.getAccessToken('conn-1')).resolves.toBe('old-access');
    expect(post).not.toHaveBeenCalled();
  });

  it('keeps using a valid token after a transient refresh failure, then cools down', async () => {
    const { service, post, update } = setup();
    post.mockRejectedValue(new Error('ECONNRESET'));

    await expect(service.getAccessToken('conn-1')).resolves.toBe('old-access');
    await expect(service.getAccessToken('conn-1')).resolves.toBe('old-access');

    expect(post).toHaveBeenCalledTimes(1);
    expect(update).not.toHaveBeenCalled();
  });

  it('marks the connection expired when ANAF rejects the refresh token', async () => {
    const { service, post, update } = setup();
    post.mockRejectedValue(
      Object.assign(new Error('400'), {
        isAxiosError: true,
        response: { status: 400, data: { error: 'invalid_grant' } },
      }),
    );
    await expect(service.getAccessToken('conn-1')).rejects.toThrow(
      /Reautorizați/,
    );
    expect(update).toHaveBeenCalledWith('conn-1', { status: 'expired' });
  });

  describe('revokeConnection', () => {
    it('revokes the refresh and access tokens with Basic auth', async () => {
      const { service, post, update } = setup();
      post.mockResolvedValue({ status: 200, data: '' });

      await expect(service.revokeConnection('conn-1')).resolves.toBe(true);

      expect(update).toHaveBeenCalledWith('conn-1', { status: 'revoked' });
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
      const { service, post, stored, cipher } = setup();
      let resolve!: (v: unknown) => void;
      post.mockReturnValueOnce(new Promise((r) => (resolve = r)));
      post.mockResolvedValue({ status: 200, data: '' });

      const access = service.getAccessToken('conn-1');
      await vi.waitFor(() => expect(post).toHaveBeenCalledTimes(1));
      const revoke = service.revokeConnection('conn-1');
      stored.refreshTokenEnc = cipher.encrypt('new-refresh');
      resolve({
        data: { access_token: fakeAnafJwt(), refresh_token: fakeAnafJwt() },
      });

      await expect(access).resolves.toBeTruthy();
      await expect(revoke).resolves.toBe(true);
      expect(new URLSearchParams(post.mock.calls[1][1]).get('token')).toBe(
        'new-refresh',
      );
    });

    it('skips the access token once it has expired', async () => {
      const { service, post } = setup({
        accessExpiresAt: new Date(Date.now() - 1000),
      });
      post.mockResolvedValue({ status: 200, data: '' });

      await service.revokeConnection('conn-1');

      expect(post).toHaveBeenCalledTimes(1);
      expect(new URLSearchParams(post.mock.calls[0][1]).get('token')).toBe(
        'old-refresh',
      );
    });

    it('does not call ANAF when the refresh token has expired', async () => {
      const { service, post } = setup({
        refreshExpiresAt: new Date(Date.now() - 1000),
      });

      await expect(service.revokeConnection('conn-1')).resolves.toBe(true);
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

      await expect(service.revokeConnection('conn-1')).resolves.toBe(false);
    });
  });
});
