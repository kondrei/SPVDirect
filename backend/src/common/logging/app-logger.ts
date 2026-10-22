import type { LoggerService } from '@nestjs/common';
import { WinstonModule, utilities } from 'nest-winston';
import { format, transports, type Logform } from 'winston';
import { LogLevel, NodeEnv } from '../../config/dto/env.enums.js';
import { redact } from './redact.js';

const dropEmptyStack = format((info) => {
  const { stack } = info;
  if (Array.isArray(stack) && stack.every((line) => line == null)) {
    delete info.stack;
  }
  return info;
});

export function logFormat(env: NodeJS.ProcessEnv): Logform.Format {
  return env.NODE_ENV === NodeEnv.Production
    ? format.combine(
        dropEmptyStack(),
        redact(),
        format.timestamp(),
        format.errors({ stack: true }),
        format.json(),
      )
    : format.combine(
        dropEmptyStack(),
        format.timestamp(),
        utilities.format.nestLike('SPVDirect', {
          colors: true,
          prettyPrint: false,
        }),
      );
}

export function logLevel(env: NodeJS.ProcessEnv): LogLevel {
  const level = env.LOG_LEVEL as LogLevel | undefined;
  return level && Object.values(LogLevel).includes(level)
    ? level
    : LogLevel.Info;
}

export function createAppLogger(env: NodeJS.ProcessEnv): LoggerService {
  return WinstonModule.createLogger({
    level: logLevel(env),
    transports: [new transports.Console({ format: logFormat(env) })],
  });
}
