import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../common/config/env.schema';
import { AssetsController } from './assets.controller';
import { AssetsService } from './assets.service';
import { FileStorage } from './storage';

@Module({
  controllers: [AssetsController],
  providers: [
    AssetsService,
    {
      provide: FileStorage,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>): FileStorage =>
        new FileStorage(config.get('STORAGE_ROOT', { infer: true })),
    },
  ],
})
export class AssetsModule {}
