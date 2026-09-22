import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'node:crypto';
import { hashPassword, verifyPassword } from './password.js';
import { TokenCipher } from './token-cipher.service.js';

function cipher(key = randomBytes(32).toString('base64')) {
  return new TokenCipher(new ConfigService({ TOKEN_ENCRYPTION_KEY: key }));
}

describe('TokenCipher', () => {
  it('round-trips a token', () => {
    const c = cipher();
    const token = 'eyJhbGciOiJSUzUxMiJ9.payload.signature';
    const enc = c.encrypt(token);
    expect(enc).not.toContain(token);
    expect(c.decrypt(enc)).toBe(token);
  });

  it('uses a fresh IV per encryption', () => {
    const c = cipher();
    expect(c.encrypt('same')).not.toBe(c.encrypt('same'));
  });

  it('rejects tampered ciphertext', () => {
    const c = cipher();
    const [v, iv, tag, data] = c.encrypt('secret-token').split(':');
    const flipped = Buffer.from(data, 'base64');
    flipped[0] ^= 1;
    expect(() =>
      c.decrypt([v, iv, tag, flipped.toString('base64')].join(':')),
    ).toThrow();
  });

  it('rejects a different key', () => {
    const enc = cipher().encrypt('secret-token');
    expect(() => cipher().decrypt(enc)).toThrow();
  });

  it('requires a 32-byte key', () => {
    expect(() => cipher(randomBytes(16).toString('base64'))).toThrow(
      /32 bytes/,
    );
  });
});

describe('password hashing', () => {
  it('verifies the right password only', async () => {
    const stored = await hashPassword('correct horse battery');
    expect(stored.startsWith('scrypt$')).toBe(true);
    await expect(verifyPassword('correct horse battery', stored)).resolves.toBe(
      true,
    );
    await expect(verifyPassword('wrong password!', stored)).resolves.toBe(
      false,
    );
  });

  it('rejects malformed hashes', async () => {
    await expect(verifyPassword('x', 'bcrypt$abc')).resolves.toBe(false);
  });
});
