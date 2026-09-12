import OpenAI from 'openai';
import { generationResultSchema } from '../public/result.schema';
import {
  ProviderError,
  type AiProvider,
  type ProviderRequest,
  type ProviderResponse,
} from '../public/provider.port';
import { costUsd } from './cost';

export interface OpenAiAdapterOptions {
  apiKey: string;
  timeoutMs?: number;
  /**
   * The SDK retries twice by default, so one "call" would silently be up to three billed
   * requests — and source 01 §28 says normal generation is one call. Transport retry and
   * the §28 repair call are different things and are kept apart here.
   */
  maxRetries?: number;
}

/** Worst case used for the pre-call cap check, since real usage is only known after. */
const ASSUMED_INPUT_TOKENS = 6_000;
const ASSUMED_OUTPUT_TOKENS = 2_000;

export class OpenAiAdapter implements AiProvider {
  readonly name = 'openai';
  private readonly client: OpenAI;

  constructor(options: OpenAiAdapterOptions) {
    this.client = new OpenAI({
      apiKey: options.apiKey,
      timeout: options.timeoutMs ?? 120_000,
      maxRetries: options.maxRetries ?? 0,
    });
  }

  estimateCostUsd(request: ProviderRequest): number {
    return costUsd(request.model, ASSUMED_INPUT_TOKENS, ASSUMED_OUTPUT_TOKENS);
  }

  async generate(request: ProviderRequest): Promise<ProviderResponse> {
    const response = await this.call(request);

    if (response.status === 'incomplete') {
      throw new ProviderError(
        'AI_TRUNCATED',
        `Response was cut short: ${response.incomplete_details?.reason ?? 'unknown reason'}`,
      );
    }

    const refusal = findRefusal(response);
    if (refusal !== null) {
      throw new ProviderError('AI_REFUSED', refusal);
    }

    const parsed = generationResultSchema.safeParse(parseJson(response.output_text));
    if (!parsed.success) {
      throw new ProviderError('AI_MALFORMED', 'Response did not match the output schema', {
        cause: parsed.error,
      });
    }

    const inputTokens = response.usage?.input_tokens ?? 0;
    const outputTokens = response.usage?.output_tokens ?? 0;

    return {
      result: parsed.data,
      requestId: response.id,
      usage: {
        inputTokens,
        outputTokens,
        estimatedCostUsd: costUsd(request.model, inputTokens, outputTokens),
      },
    };
  }

  private async call(request: ProviderRequest): Promise<OpenAI.Responses.Response> {
    try {
      return await this.client.responses.create({
        model: request.model,
        instructions: request.systemPrompt,
        input: [{ role: 'user', content: buildContent(request) }],
        text: {
          format: {
            type: 'json_schema',
            name: 'ad_package',
            strict: true,
            schema: request.jsonSchema,
          },
        },
        // Avoids provider-side retention where supported. This is not a guarantee of
        // zero retention and must never be described as one (source 01 §27).
        store: false,
      });
    } catch (cause) {
      throw toProviderError(cause);
    }
  }
}

function buildContent(request: ProviderRequest): OpenAI.Responses.ResponseInputMessageContentList {
  const content: OpenAI.Responses.ResponseInputMessageContentList = [
    { type: 'input_text', text: request.dataBlock },
  ];

  for (const image of request.images) {
    content.push({
      type: 'input_image',
      detail: 'high',
      image_url: `data:${image.mimeType};base64,${image.bytes.toString('base64')}`,
    });
  }

  if (request.repairErrors && request.repairErrors.length > 0) {
    content.push({
      type: 'input_text',
      text: [
        'Your previous answer failed these server checks. Fix every one and return the',
        'corrected JSON object. Change nothing else.',
        ...request.repairErrors.map((issue) => `- ${issue}`),
      ].join('\n'),
    });
  }

  return content;
}

function findRefusal(response: OpenAI.Responses.Response): string | null {
  for (const item of response.output) {
    if (item.type !== 'message') continue;

    for (const part of item.content) {
      if (part.type === 'refusal') return part.refusal;
    }
  }

  return null;
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch (cause) {
    throw new ProviderError('AI_MALFORMED', 'Response was not valid JSON', { cause });
  }
}

function toProviderError(cause: unknown): ProviderError {
  if (cause instanceof ProviderError) return cause;

  if (cause instanceof OpenAI.APIUserAbortError || isTimeout(cause)) {
    return new ProviderError('AI_TIMEOUT', 'The provider did not answer in time', { cause });
  }

  if (cause instanceof OpenAI.APIError) {
    // The provider's own message can carry request detail, so it is never reused as the
    // user-facing text; the code is what callers act on (spec §9).
    return new ProviderError('AI_UNAVAILABLE', `Provider returned ${String(cause.status)}`, {
      cause,
    });
  }

  return new ProviderError('AI_UNAVAILABLE', 'The provider call failed', { cause });
}

function isTimeout(cause: unknown): boolean {
  return (
    cause instanceof Error && (cause.name === 'TimeoutError' || /timed? ?out/i.test(cause.message))
  );
}
