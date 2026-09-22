import { decodeAnafClaims } from './anaf-jwt.js';
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
});
