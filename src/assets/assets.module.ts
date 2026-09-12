import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../common/config/env.schema';
import { AssetsController } from './assets.controller';
import { AssetsService } from './assets.service';
import { FileStorage } from './storage';
import { MODEL_INPUT_READER } from './public/assets.port';

/**
 * Global for the reason AuthModule and ProjectsModule are: R-7 forbids
 * generation/generation.module.ts from importing this file, so the reader port reaches it
 * through the global scope instead. Only MODEL_INPUT_READER is exported — the worker gets
 * the bytes and nothing else.
 */
@Global()
@Module({
  controllers: [AssetsController],
  providers: [
    AssetsService,
    { provide: MODEL_INPUT_READER, useExisting: AssetsService },
    {
      provide: FileStorage,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>): FileStorage =>
        new FileStorage(config.get('STORAGE_ROOT', { infer: true })),
    },
  ],
  exports: [MODEL_INPUT_READER],
})
export class AssetsModule {}
