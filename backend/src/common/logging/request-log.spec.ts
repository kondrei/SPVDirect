import { EventEmitter } from 'node:events';
import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  Logger,
  type ArgumentsHost,
} from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import type { NextFunction, Request, Response } from 'express';
import { ErrorCaptureFilter, errorMessage, requestLog } from './request-log.js';

function call(
  req: Partial<Request>,
  status: number | null,
  error?: unknown,
): void {
  const res = Object.assign(new EventEmitter(), {
    statusCode: status ?? 200,
    writableFinished: status !== null,
  }) as unknown as Response;
  const next = vi.fn<NextFunction>();
  requestLog(
    { method: 'GET', path: '/', originalUrl: '/', ...req } as Request,
    res,
    next,
  );
  expect(next).toHaveBeenCalledOnce();
  if (error !== undefined) {
    vi.spyOn(BaseExceptionFilter.prototype, 'catch').mockImplementation(
      () => {},
    );
    new ErrorCaptureFilter().catch(error, {
      getType: () => 'http',
      switchToHttp: () => ({ getResponse: () => res }),
    } as unknown as ArgumentsHost);
  }
  res.emit('close');
}

describe('requestLog', () => {
  let log: ReturnType<typeof vi.spyOn>;
  let warn: ReturnType<typeof vi.spyOn>;
  let error: ReturnType<typeof vi.spyOn>;
  let debug: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    log = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    error = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
    debug = vi.spyOn(Logger.prototype, 'debug').mockImplementation(() => {});
  });

  afterEach(() => vi.restoreAllMocks());

  it('logs a successful request with the route pattern, never the raw URL', () => {
    call(
      {
        method: 'POST',
        path: '/accountants/2/companies/7',
        originalUrl: '/accountants/2/companies/7?x=1',
        route: { path: '/accountants/:accountantId/companies/:id' },
      },
      201,
    );
    expect(log).toHaveBeenCalledWith({
      message: 'POST /accountants/:accountantId/companies/:id 201',
      method: 'POST',
      route: '/accountants/:accountantId/companies/:id',
      statusCode: 201,
      responseTimeMs: expect.any(Number),
      accountantId: 2,
      error: null,
    });
  });

  it('keeps link tokens and OAuth codes out of the log', () => {
    call(
      {
        path: '/anaf/callback',
        originalUrl: '/anaf/callback?code=secret-code&state=s',
        route: { path: '/anaf/callback' },
      },
      302,
    );
    call(
      {
        path: '/anaf/authorize/tok3n',
        originalUrl: '/anaf/authorize/tok3n',
        route: { path: '/anaf/authorize/:token' },
      },
      200,
    );
    const logged = JSON.stringify(log.mock.calls);
    expect(logged).not.toContain('secret-code');
    expect(logged).not.toContain('tok3n');
  });

  it('logs a client error as a warning with the error message', () => {
    call(
      { route: { path: '/accountants/:accountantId/companies' } },
      400,
      new BadRequestException(['cui must be a string', 'name is empty']),
    );
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 400,
        error: 'cui must be a string; name is empty',
        accountantId: null,
      }),
    );
  });

  it('logs a server error as an error', () => {
    call({}, 500, new Error('db down'));
    expect(error).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 500, error: 'db down' }),
    );
  });

  it('logs an unmatched path as it was requested', () => {
    call({ path: '/nope', originalUrl: '/nope' }, 404);
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({ route: '/nope', statusCode: 404 }),
    );
  });

  it('logs a request the client dropped as aborted', () => {
    call({ path: '/x' }, null);
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'GET /x aborted', statusCode: null }),
    );
  });

  it('logs health checks only at debug level', () => {
    call({ path: '/health', route: { path: '/health' } }, 200);
    expect(debug).toHaveBeenCalledOnce();
    expect(log).not.toHaveBeenCalled();
  });
});

describe('errorMessage', () => {
  it('reads the message of an HttpException body', () => {
    expect(errorMessage(new ForbiddenException('Acces interzis'))).toBe(
      'Acces interzis',
    );
    expect(errorMessage(new HttpException('Prea multe cereri', 429))).toBe(
      'Prea multe cereri',
    );
    expect(errorMessage(new HttpException({ code: 1 }, 409))).toBe(
      'Http Exception',
    );
  });

  it('reads plain errors and strings', () => {
    expect(errorMessage(new Error('boom'))).toBe('boom');
    expect(errorMessage('boom')).toBe('boom');
    expect(errorMessage({ x: 1 })).toBe('Unknown error');
  });
});

describe('ErrorCaptureFilter', () => {
  afterEach(() => vi.restoreAllMocks());

  it('still lets Nest answer the error', () => {
    const base = vi
      .spyOn(BaseExceptionFilter.prototype, 'catch')
      .mockImplementation(() => {});
    const host = { getType: () => 'rpc' } as unknown as ArgumentsHost;
    const exception = new Error('x');
    new ErrorCaptureFilter().catch(exception, host);
    expect(base).toHaveBeenCalledWith(exception, host);
  });
});
