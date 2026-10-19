import { decodeAnafClaims, describeTokenShape } from './anaf-jwt.js';
import { fakeAnafJwt } from '../testing/fake-anaf-jwt.js';

describe('decodeAnafClaims', () => {
  it('reads serial, roles and exp from an ANAF-shaped token', () => {
    const claims = decodeAnafClaims(fakeAnafJwt({ exp: 1705509635 }));
    expect(claims.serial).toBe('34:00:00:25:69:aa:bb:cc:dd:00:25:69');
    expect(claims.roles).toEqual([
      'HELLO',
      'EFACTURA',
      'ETRANSPORT',
      'SRV_EFACTURA',
    ]);
    expect(claims.exp?.toISOString()).toBe('2024-01-17T16:40:35.000Z');
  });

  it('falls back to scope_data entries', () => {
    const token = fakeAnafJwt({
      serial: undefined,
      role: undefined,
      scope_data: [
        { id: 'role', value: 'HELLO' },
        { id: 'serial', value: 'ab:cd' },
      ],
    });
    expect(decodeAnafClaims(token)).toMatchObject({
      serial: 'ab:cd',
      roles: ['HELLO'],
    });
  });

  it('returns empty claims for opaque tokens', () => {
    expect(decodeAnafClaims('not-a-jwt')).toEqual({
      serial: null,
      roles: [],
      exp: null,
    });
  });

  it('accepts exp as a numeric string', () => {
    const claims = decodeAnafClaims(fakeAnafJwt({ exp: '1705509635' }));
    expect(claims.exp?.toISOString()).toBe('2024-01-17T16:40:35.000Z');
  });

  it('ignores a non-numeric exp', () => {
    expect(decodeAnafClaims(fakeAnafJwt({ exp: 'soon' })).exp).toBeNull();
  });
});

describe('describeTokenShape', () => {
  it('lists claim names but no claim values', () => {
    const shape = describeTokenShape(fakeAnafJwt({ exp: undefined }));
    expect(shape).toContain('JWT, claims:');
    expect(shape).toContain('serial');
    expect(shape).toContain('exp is undefined');
    expect(shape).not.toContain('34:00:00');
  });

  it('describes an opaque token without echoing it', () => {
    const shape = describeTokenShape('opaque-secret-value');
    expect(shape).toBe('opaque, 1 segment(s), 19 chars');
  });
});
