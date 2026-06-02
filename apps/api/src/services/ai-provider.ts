import type { AppEnv } from '@jobautomation/config';
import {
  createHostedAiGatewayProvider,
  createOpenRouterProvider,
  type GenerateStructuredObjectInput,
  type GenerateStructuredObjectResult
} from '@jobautomation/llm';

export type StructuredAiProvider = {
  generateStructuredObject(input: GenerateStructuredObjectInput): Promise<unknown>;
  generateStructuredObjectWithMetadata?: (
    input: GenerateStructuredObjectInput
  ) => Promise<GenerateStructuredObjectResult>;
};

export function createStructuredAiProvider(
  config: AppEnv,
  options?: { model?: string | null | undefined; enableReasoning?: boolean }
): StructuredAiProvider | null {
  if (config.JOBAUTOMATION_AI_GATEWAY_BASE_URL && config.JOBAUTOMATION_AI_AUTH_TOKEN) {
    return createHostedAiGatewayProvider({
      baseUrl: config.JOBAUTOMATION_AI_GATEWAY_BASE_URL,
      authToken: config.JOBAUTOMATION_AI_AUTH_TOKEN
    });
  }

  const model = options?.model ?? config.OPENROUTER_JOB_SUMMARY_MODEL;
  if (!config.OPENROUTER_API_KEY || !model) {
    return null;
  }

  return createOpenRouterProvider({
    apiKey: config.OPENROUTER_API_KEY,
    baseUrl: config.OPENROUTER_API_BASE_URL,
    model,
    ...(options?.enableReasoning
      ? {
          reasoning: {
            enabled: true,
            exclude: true
          }
        }
      : {})
  });
}

export function isStructuredAiConfigured(config: AppEnv): boolean {
  return Boolean(
    (config.JOBAUTOMATION_AI_GATEWAY_BASE_URL && config.JOBAUTOMATION_AI_AUTH_TOKEN) ||
      config.OPENROUTER_API_KEY
  );
}
