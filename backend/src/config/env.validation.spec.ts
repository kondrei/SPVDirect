import { envValidationSchema } from './env.validation.js';

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

function validate(env: Record<string, unknown>) {
  return envValidationSchema.validate(env);
}

describe('envValidationSchema: registration and mail', () => {
  it('applies the reCAPTCHA and SMTP defaults', () => {
    const { value, error } = validate(base);
    expect(error).toBeUndefined();
    expect(value).toMatchObject({
      RECAPTCHA_MIN_SCORE: 0.5,
      RECAPTCHA_VERIFY_URL: 'https://www.google.com/recaptcha/api/siteverify',
      SMTP_PORT: 587,
      SMTP_SECURE: false,
    });
  });

  it.each(['ADMIN_EMAIL', 'RECAPTCHA_SECRET_KEY', 'MAIL_FROM', 'SMTP_HOST'])(
    'requires %s',
    (key) => {
      const env: Record<string, unknown> = { ...base };
      delete env[key];
      expect(validate(env).error?.message).toMatch(key);
    },
  );

  it('rejects an ADMIN_EMAIL that is not an email', () => {
    expect(
      validate({ ...base, ADMIN_EMAIL: 'not-an-email' }).error?.message,
    ).toMatch(/ADMIN_EMAIL/);
  });

  it('keeps RECAPTCHA_MIN_SCORE between 0 and 1', () => {
    expect(validate({ ...base, RECAPTCHA_MIN_SCORE: 1.5 }).error).toBeDefined();
  });

  it('accepts the empty SMTP credentials from .env.example', () => {
    expect(
      validate({ ...base, SMTP_USER: '', SMTP_PASS: '' }).error,
    ).toBeUndefined();
  });
});
