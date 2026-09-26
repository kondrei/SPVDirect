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
  HTTPS_KEY_FILE?: string;
  HTTPS_CERT_FILE?: string;
}
