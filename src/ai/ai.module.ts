import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../common/config/env.schema';
import { AdGeneratorService } from './ad-generator';
import { OpenAiAdapter } from './providers/openai.adapter';
import { AD_GENERATOR } from './public/generator.port';
import { AI_PROVIDER } from './public/provider.port';

/**
 * P1's ai code was a library for the CLI and had no Nest module. P4's worker is its
 * first in-app caller, so it gets one — global, for the reason the other modules are:
 * R-7 forbids generation/generation.module.ts from importing this file, so the two
 * tokens reach it through the global scope.
 *
 * Only the ports are exported. The worker gets AD_GENERATOR and never sees the prompt,
 * the validators or the provider adapter.
 */
@Global()
@Module({
  providers: [
    {
      provide: AI_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>): OpenAiAdapter =>
        // Not validated here on purpose: D-029/D-061's convention is that a missing key
        // fails at the point of use, so CI and a fresh checkout can still boot.
        new OpenAiAdapter({ apiKey: config.get('OPENAI_API_KEY', { infer: true }) }),
    },
    AdGeneratorService,
    { provide: AD_GENERATOR, useExisting: AdGeneratorService },
  ],
  exports: [AI_PROVIDER, AD_GENERATOR],
})
export class AiModule {}
