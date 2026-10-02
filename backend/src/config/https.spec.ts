import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { envValidationSchema } from './env.validation.js';
import { loadHttpsOptions } from './https.js';

describe('loadHttpsOptions', () => {
  let dir: string;
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'spv-https-'));
    writeFileSync(join(dir, 'key.pem'), 'KEY');
    writeFileSync(join(dir, 'cert.pem'), 'CERT');
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it('serves plain HTTP when no files are configured', () => {
    expect(loadHttpsOptions({})).toBeUndefined();
  });

  it('reads the key and certificate files', () => {
    const options = loadHttpsOptions({
      HTTPS_KEY_FILE: join(dir, 'key.pem'),
      HTTPS_CERT_FILE: join(dir, 'cert.pem'),
    });
    expect(String(options?.key)).toBe('KEY');
    expect(String(options?.cert)).toBe('CERT');
  });

  it('fails fast when a configured file is missing', () => {
    expect(() =>
      loadHttpsOptions({
        HTTPS_KEY_FILE: join(dir, 'missing.pem'),
        HTTPS_CERT_FILE: join(dir, 'cert.pem'),
      }),
    ).toThrow(/ENOENT/);
  });
});

describe('env validation of the HTTPS files', () => {
  const base = {
    API_URL: 'https://localhost:3000',
    FRONTEND_URL: 'http://localhost:5173',
    DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
    JWT_SECRET: 'x'.repeat(32),
    TOKEN_ENCRYPTION_KEY: Buffer.alloc(32).toString('base64'),
    ANAF_CLIENT_ID: 'id',
    ANAF_CLIENT_SECRET: 'secret',
    ANAF_REDIRECT_URI: 'https://localhost:3000/anaf/callback',
    RECAPTCHA_SECRET_KEY: 'recaptcha-secret',
    ADMIN_EMAIL: 'admin@example.com',
    MAIL_FROM: 'SPVDirect <no-reply@example.com>',
    SMTP_HOST: 'smtp.example.com',
  };

  it('accepts both files or neither', () => {
    expect(envValidationSchema.validate(base).error).toBeUndefined();
    expect(
      envValidationSchema.validate({
        ...base,
        HTTPS_KEY_FILE: 'k.pem',
        HTTPS_CERT_FILE: 'c.pem',
      }).error,
    ).toBeUndefined();
  });

  it('rejects only one of the two files', () => {
    expect(
      envValidationSchema.validate({ ...base, HTTPS_KEY_FILE: 'k.pem' }).error
        ?.message,
    ).toMatch(/HTTPS_CERT_FILE/);
  });
});
