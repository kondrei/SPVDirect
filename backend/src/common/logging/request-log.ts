import {
  Catch,
  HttpException,
  Logger,
  type ArgumentsHost,
} from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import type { NextFunction, Request, Response } from 'express';
import { ACCOUNTANT_PATH, HEALTH_PATH } from '../constants.js';

const errors = new WeakMap<Response, string>();
const logger = new Logger('Http');

export function errorMessage(exception: unknown): string {
  if (exception instanceof HttpException) {
    const body = exception.getResponse();
    if (typeof body === 'string') return body;
    const { message } = body as { message?: unknown };
    if (Array.isArray(message)) return message.join('; ');
    if (typeof message === 'string') return message;
    return exception.message;
  }
  if (exception instanceof Error) return exception.message;
  return typeof exception === 'string' ? exception : 'Unknown error';
}

@Catch()
export class ErrorCaptureFilter extends BaseExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    if (host.getType() === 'http') {
      errors.set(
        host.switchToHttp().getResponse<Response>(),
        errorMessage(exception),
      );
    }
    super.catch(exception, host);
  }
}

export function requestLog(req: Request, res: Response, next: NextFunction) {
  const started = performance.now();
  res.on('close', () => {
    const route =
      (req.route as { path?: string } | undefined)?.path ?? req.path;
    const statusCode = res.writableFinished ? res.statusCode : null;
    const accountantId = ACCOUNTANT_PATH.exec(req.originalUrl)?.[1];
    const entry = {
      message: `${req.method} ${route} ${statusCode ?? 'aborted'}`,
      method: req.method,
      route,
      statusCode,
      responseTimeMs: Math.round(performance.now() - started),
      accountantId: accountantId ? Number(accountantId) : null,
      error: errors.get(res) ?? null,
    };
    if (statusCode !== null && statusCode >= 500) logger.error(entry);
    else if (statusCode === null || statusCode >= 400) logger.warn(entry);
    else if (req.path === HEALTH_PATH) logger.debug(entry);
    else logger.log(entry);
  });
  next();
}
