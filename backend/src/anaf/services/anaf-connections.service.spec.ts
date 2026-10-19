import type { Repository } from 'typeorm';
import type { AnafConnection } from '../anaf-connection.entity.js';
import { redactBearerTokens } from '../redact-bearer.js';
import type { AnafApiService } from './anaf-api.service.js';
import { AnafConnectionsService } from './anaf-connections.service.js';
import type { AnafOAuthService } from './anaf-oauth.service.js';

const HELLO =
  'Hello, SPVDirect headers=key=Accept val=[application/json] ' +
  'key=Authorization val=[Bearer eyJhbGciOi.eyJzdWIi.c2lnbmF0dXJl] ' +
  'key=role val=[HELLO] key=serial_certificate val=[2621742f033c0099b8303a0e]';

describe('redactBearerTokens', () => {
  it('hides the token ANAF echoes back and keeps the other headers', () => {
    const out = redactBearerTokens(HELLO);
    expect(out).not.toContain('eyJ');
    expect(out).toContain('key=Authorization val=[Bearer [ascuns]]');
    expect(out).toContain(
      'key=serial_certificate val=[2621742f033c0099b8303a0e]',
    );
  });

  it('hides every token, whatever the case or separator', () => {
    expect(redactBearerTokens('bearer abc.def, BEARER xyz')).toBe(
      'Bearer [ascuns], Bearer [ascuns]',
    );
  });

  it('leaves text without a token unchanged', () => {
    expect(redactBearerTokens('Hello, SPVDirect')).toBe('Hello, SPVDirect');
  });
});

describe('AnafConnectionsService.test', () => {
  it('returns the TestOAuth reply without the access token', async () => {
    const api = {
      request: vi.fn().mockResolvedValue({ status: 200, data: HELLO }),
    };
    const service = new AnafConnectionsService(
      api as unknown as AnafApiService,
      {} as AnafOAuthService,
      {} as Repository<AnafConnection>,
    );

    const result = await service.test(4, 9);

    expect(api.request).toHaveBeenCalledWith(
      expect.objectContaining({
        accountantId: 4,
        connectionId: 9,
        path: '/TestOauth/jaxrs/hello',
      }),
    );
    expect(result.status).toBe(200);
    expect(result.body).not.toContain('eyJ');
    expect(result.body).toContain('Bearer [ascuns]');
  });
});
