import { randomUUID } from 'node:crypto';
import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LoggerModule as PinoLoggerModule } from 'nestjs-pino';
import type { Env } from '../config/env.schema';

/**
 * Spec §10: logs never carry images, full prompts, full briefs, cookies or keys.
 *
 * fast-redact (pino's redaction engine) only accepts `*` as a whole path segment, so
 * each shape is spelled out rather than pattern-matched on a suffix.
 */
const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers["set-cookie"]',
  '*.token',
  '*.password',
  '*.secret',
  '*.apiKey',
  'DATABASE_URL',
  'REDIS_URL',
  'OPENAI_API_KEY',
  // The product's own sensitive payloads (spec §10). Present from P1 onward; listed
  // now so no generation code can land before the redaction exists.
  '*.prompt',
  '*.promptEn',
  '*.brief',
  '*.description',
  '*.imageBase64',
];

interface ResponseWithHeader {
  setHeader(name: string, value: string): void;
}

@Global()
@Module({
  exports: [PinoLoggerModule],
  imports: [
    PinoLoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => {
        const isDev = config.get('NODE_ENV', { infer: true }) === 'development';
        const level = config.get('LOG_LEVEL', { infer: true }) ?? (isDev ? 'debug' : 'info');

        return {
          pinoHttp: {
            level,
            redact: { paths: REDACT_PATHS, censor: '[redacted]' },
            genReqId: (_req: unknown, res: ResponseWithHeader): string => {
              const id = randomUUID();
              res.setHeader('x-request-id', id);
              return id;
            },
            ...(isDev
              ? {
                  transport: {
                    target: 'pino-pretty',
                    options: { translateTime: 'SYS:standard', singleLine: false },
                  },
                }
              : {}),
          },
        };
      },
    }),
  ],
})
export class LoggerModule {}
