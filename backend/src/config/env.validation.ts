import Joi from 'joi';

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'test', 'production')
    .default('development'),
  PORT: Joi.number().port().default(3000),
  API_URL: Joi.string().uri().required(),
  FRONTEND_URL: Joi.string().uri().required(),

  DATABASE_URL: Joi.string()
    .uri({ scheme: ['postgres', 'postgresql'] })
    .required(),
  DATABASE_SSL: Joi.boolean().default(true),

  JWT_SECRET: Joi.string().min(32).required(),
  TOKEN_ENCRYPTION_KEY: Joi.string().base64().required(),

  ANAF_CLIENT_ID: Joi.string().required(),
  ANAF_CLIENT_SECRET: Joi.string().required(),
  ANAF_REDIRECT_URI: Joi.string().uri().required(),
  ANAF_AUTH_ENDPOINT: Joi.string()
    .uri()
    .default('https://logincert.anaf.ro/anaf-oauth2/v1/authorize'),
  ANAF_TOKEN_ENDPOINT: Joi.string()
    .uri()
    .default('https://logincert.anaf.ro/anaf-oauth2/v1/token'),
  ANAF_REVOKE_ENDPOINT: Joi.string()
    .uri()
    .default('https://logincert.anaf.ro/anaf-oauth2/v1/revoke'),
  ANAF_API_ENDPOINT: Joi.string().uri().default('https://api.anaf.ro'),
  ANAF_ENV: Joi.string().valid('test', 'prod').default('test'),
  ANAF_TVA_ENDPOINT: Joi.string()
    .uri()
    .default('https://webservicesp.anaf.ro/api/PlatitorTvaRest/v9/tva'),
  DATA_GOV_RO_API_URL: Joi.string()
    .uri()
    .default('https://data.gov.ro/api/3/action'),

  RECAPTCHA_SECRET_KEY: Joi.string().required(),
  RECAPTCHA_MIN_SCORE: Joi.number().min(0).max(1).default(0.5),
  RECAPTCHA_VERIFY_URL: Joi.string()
    .uri()
    .default('https://www.google.com/recaptcha/api/siteverify'),

  ADMIN_EMAIL: Joi.string().email().required(),
  MAIL_FROM: Joi.string().required(),
  SMTP_HOST: Joi.string().hostname().required(),
  SMTP_PORT: Joi.number().port().default(587),
  SMTP_SECURE: Joi.boolean().default(false),
  SMTP_USER: Joi.string().allow(''),
  SMTP_PASS: Joi.string().allow(''),

  HTTPS_KEY_FILE: Joi.string(),
  HTTPS_CERT_FILE: Joi.string(),
}).and('HTTPS_KEY_FILE', 'HTTPS_CERT_FILE');

export interface Env {
  NODE_ENV: 'development' | 'test' | 'production';
  PORT: number;
  API_URL: string;
  FRONTEND_URL: string;
  DATABASE_URL: string;
  DATABASE_SSL: boolean;
  JWT_SECRET: string;
  TOKEN_ENCRYPTION_KEY: string;
  ANAF_CLIENT_ID: string;
  ANAF_CLIENT_SECRET: string;
  ANAF_REDIRECT_URI: string;
  ANAF_AUTH_ENDPOINT: string;
  ANAF_TOKEN_ENDPOINT: string;
  ANAF_REVOKE_ENDPOINT: string;
  ANAF_API_ENDPOINT: string;
  ANAF_ENV: 'test' | 'prod';
  ANAF_TVA_ENDPOINT: string;
  DATA_GOV_RO_API_URL: string;
  RECAPTCHA_SECRET_KEY: string;
  RECAPTCHA_MIN_SCORE: number;
  RECAPTCHA_VERIFY_URL: string;
  ADMIN_EMAIL: string;
  MAIL_FROM: string;
  SMTP_HOST: string;
  SMTP_PORT: number;
  SMTP_SECURE: boolean;
  SMTP_USER?: string;
  SMTP_PASS?: string;
  HTTPS_KEY_FILE?: string;
  HTTPS_CERT_FILE?: string;
}
