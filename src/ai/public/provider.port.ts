import type { Brief } from './brief.schema';
import type { GenerationResult } from './result.schema';

export const AI_PROVIDER = Symbol('AI_PROVIDER');

export interface ReferenceImage {
  /** Raw bytes of the model-input copy, already downsized and stripped of metadata. */
  bytes: Buffer;
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
}

export interface ProviderRequest {
  systemPrompt: string;
  dataBlock: string;
  images: ReferenceImage[];
  jsonSchema: Record<string, unknown>;
  model: string;
  /** Validator errors from the first attempt. Present only on a repair call. */
  repairErrors?: string[];
}

export interface ProviderUsage {
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
}

export interface ProviderResponse {
  result: GenerationResult;
  usage: ProviderUsage;
  requestId: string | null;
}

export type ProviderErrorCode =
  | 'AI_TIMEOUT'
  | 'AI_REFUSED'
  | 'AI_TRUNCATED'
  | 'AI_MALFORMED'
  | 'AI_UNAVAILABLE';

export class ProviderError extends Error {
  constructor(
    readonly code: ProviderErrorCode,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = 'ProviderError';
  }
}

export interface AiProvider {
  readonly name: string;
  /** Worst-case cost of one call, used to check the spend cap before spending. */
  estimateCostUsd(request: ProviderRequest): number;
  generate(request: ProviderRequest): Promise<ProviderResponse>;
}

export type { Brief, GenerationResult };
