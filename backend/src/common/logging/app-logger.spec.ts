import { LogLevel, NodeEnv } from '../../config/dto/env.enums.js';
import { createAppLogger, logFormat, logLevel } from './app-logger.js';

const MESSAGE = Symbol.for('message');

function render(env: NodeJS.ProcessEnv, info: Record<string, unknown>) {
  const out = logFormat(env).transform({
    level: 'info',
    message: 'ANAF GET /x',
    ...info,
  });
  return out ? String((out as Record<symbol, unknown>)[MESSAGE]) : '';
}

describe('logFormat', () => {
  it('writes one JSON line with every field in production', () => {
    const line = render(
      { NODE_ENV: NodeEnv.Production },
      { context: 'ApiLog', service: 'ACTIVITY', accountantId: 1 },
    );
    expect(JSON.parse(line)).toMatchObject({
      level: 'info',
      message: 'ANAF GET /x',
      context: 'ApiLog',
      service: 'ACTIVITY',
      accountantId: 1,
      timestamp: expect.any(String),
    });
  });

  it('writes Nest-style lines with the fields as inline JSON outside production', () => {
    const line = render(
      { NODE_ENV: NodeEnv.Development },
      { context: 'ApiLog', service: 'ACTIVITY', details: { cui: '123' } },
    );
    expect(line).toContain('[SPVDirect]');
    expect(line).toContain('ANAF GET /x');
    expect(line).toContain('{"service":"ACTIVITY","details":{"cui":"123"}}');
    expect(line).not.toContain('\n');
  });

  it('redacts personal data in production and keeps it in development', () => {
    const info = {
      context: 'ApiLog',
      description: 'Factura a fost trimisă pe email la a@b.ro',
      details: { emailedTo: 'a@b.ro', invoiceId: 9 },
    };
    const prod = render({ NODE_ENV: NodeEnv.Production }, info);
    expect(prod).not.toContain('a@b.ro');
    expect(JSON.parse(prod)).toMatchObject({
      details: { emailedTo: '[redacted]', invoiceId: 9 },
    });
    expect(JSON.parse(prod)).not.toHaveProperty('description');
    expect(render({ NODE_ENV: NodeEnv.Development }, info)).toContain('a@b.ro');
  });

  it('drops the empty stack Nest adds to an error without a trace', () => {
    const line = render(
      { NODE_ENV: NodeEnv.Production },
      { level: 'error', stack: [undefined] },
    );
    expect(JSON.parse(line)).not.toHaveProperty('stack');
  });

  it('keeps a real stack', () => {
    const line = render(
      { NODE_ENV: NodeEnv.Production },
      { level: 'error', stack: ['Error: x\n    at y'] },
    );
    expect(JSON.parse(line).stack).toEqual(['Error: x\n    at y']);
  });
});

describe('logLevel', () => {
  it('uses LOG_LEVEL and falls back to info', () => {
    expect(logLevel({ LOG_LEVEL: LogLevel.Debug })).toBe(LogLevel.Debug);
    expect(logLevel({})).toBe(LogLevel.Info);
    expect(logLevel({ LOG_LEVEL: 'loud' })).toBe(LogLevel.Info);
  });
});

describe('createAppLogger', () => {
  it('returns a Nest logger backed by winston', () => {
    const logger = createAppLogger({ NODE_ENV: NodeEnv.Production });
    expect(typeof logger.log).toBe('function');
    expect(typeof logger.warn).toBe('function');
  });
});
