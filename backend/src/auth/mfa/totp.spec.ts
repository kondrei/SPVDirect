import {
  base32Decode,
  base32Encode,
  generateTotpSecret,
  hotp,
  matchTotp,
  otpauthUri,
  totpCode,
  totpStep,
} from './totp.js';

const RFC_KEY = Buffer.from('12345678901234567890');
const RFC_SECRET = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';

describe('base32', () => {
  it('encodes the RFC 6238 key the way authenticator apps expect', () => {
    expect(base32Encode(RFC_KEY)).toBe(RFC_SECRET);
  });

  it('decodes lower case, spaces and padding', () => {
    expect(base32Decode('gezd gnbv gy3t qojq gezd gnbv gy3t qojq==')).toEqual(
      RFC_KEY,
    );
  });

  it('round-trips random secrets', () => {
    const secret = generateTotpSecret();
    expect(secret).toMatch(/^[A-Z2-7]{32}$/);
    expect(base32Encode(base32Decode(secret))).toBe(secret);
  });

  it('rejects characters outside the alphabet', () => {
    expect(() => base32Decode('ABC1')).toThrow();
  });
});

describe('TOTP (RFC 6238, SHA-1)', () => {
  it.each([
    [59, '94287082'],
    [1111111109, '07081804'],
    [1111111111, '14050471'],
    [1234567890, '89005924'],
    [2000000000, '69279037'],
    [20000000000, '65353130'],
  ])('matches the RFC vector at %i s', (seconds, expected) => {
    expect(hotp(RFC_KEY, totpStep(seconds * 1000), 8)).toBe(expected);
    expect(totpCode(RFC_SECRET, totpStep(seconds * 1000))).toBe(
      expected.slice(2),
    );
  });

  const now = 1111111111 * 1000;
  const step = totpStep(now);

  it('accepts the current code and returns its step', () => {
    expect(matchTotp(RFC_SECRET, '050471', now, null)).toBe(step);
  });

  it('accepts one step of clock drift either way', () => {
    expect(
      matchTotp(RFC_SECRET, totpCode(RFC_SECRET, step - 1), now, null),
    ).toBe(step - 1);
    expect(
      matchTotp(RFC_SECRET, totpCode(RFC_SECRET, step + 1), now, null),
    ).toBe(step + 1);
  });

  it('rejects codes two steps away', () => {
    expect(
      matchTotp(RFC_SECRET, totpCode(RFC_SECRET, step - 2), now, null),
    ).toBeNull();
  });

  it('rejects a code whose step was already used', () => {
    expect(matchTotp(RFC_SECRET, '050471', now, step)).toBeNull();
    expect(
      matchTotp(RFC_SECRET, totpCode(RFC_SECRET, step + 1), now, step),
    ).toBe(step + 1);
  });

  it('rejects a wrong code and a code of the wrong length', () => {
    expect(matchTotp(RFC_SECRET, '000000', now, null)).toBeNull();
    expect(matchTotp(RFC_SECRET, '05047', now, null)).toBeNull();
  });
});

describe('otpauthUri', () => {
  it('builds the URI with issuer, label and parameters', () => {
    const uri = new URL(otpauthUri('ana@example.ro', RFC_SECRET));
    expect(uri.protocol).toBe('otpauth:');
    expect(uri.host).toBe('totp');
    expect(decodeURIComponent(uri.pathname)).toBe('/SPVDirect:ana@example.ro');
    expect(Object.fromEntries(uri.searchParams)).toEqual({
      secret: RFC_SECRET,
      issuer: 'SPVDirect',
      algorithm: 'SHA1',
      digits: '6',
      period: '30',
    });
  });
});
