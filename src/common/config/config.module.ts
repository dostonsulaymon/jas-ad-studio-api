import { Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';
import { validateEnv } from './env.schema';

const nodeEnv = process.env.NODE_ENV ?? 'development';

@Module({
  imports: [
    NestConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      // Earlier entries win, so a personal .env.local overrides the shared
      // per-environment file.
      envFilePath: ['.env.local', `.env.${nodeEnv}`, '.env'],
      validate: validateEnv,
    }),
  ],
})
export class ConfigModule {}
