import { formatOpenRouterHttpError } from './open-router-http-error';

export type OpenRouterConfig = {
  apiKey: string;
  baseUrl: string;
  model: string;
  fetchImpl?: typeof fetch;
};

export type GenerateStructuredObjectInput = {
  schemaName: string;
  schema: Record<string, unknown>;
  systemPrompt: string;
  prompt: string;
};

type OpenRouterResponse = {
  choices?: Array<{
    message?: {
      content?:
        | string
        | Array<{
            type?: string;
            text?: string;
          }>;
    };
  }>;
};

type OpenRouterErrorResponse = {
  error?: {
    message?: string;
  };
};

const OPENROUTER_MAX_FETCH_ATTEMPTS = 3;
const OPENROUTER_RETRY_DELAY_MS = 2000;
const OPENROUTER_REQUEST_TIMEOUT_MS = 300_000;

function trimTrailingSlash(value: string): string {
  return value.endsWith('/') ? value.slice(0, -1) : value;
}

function readMessageContent(response: OpenRouterResponse): string {
  const content = response.choices?.[0]?.message?.content;

  if (typeof content === 'string') {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => part.text ?? '')
      .join('')
      .trim();
  }

  throw new Error('OpenRouter returned an empty response.');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function readFetchErrorDetails(error: unknown): string {
  if (!(error instanceof Error)) {
    return '';
  }

  const cause = error.cause as
    | {
        code?: string;
        message?: string;
      }
    | undefined;
  const details: string[] = [];

  if (cause?.code) {
    details.push(`code=${cause.code}`);
  }

  if (cause?.message) {
    details.push(`cause=${cause.message}`);
  }

  if (details.length === 0) {
    return '';
  }

  return ` (${details.join(', ')})`;
}

function isRetryableFetchError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  const cause = error.cause as
    | {
        code?: string;
        message?: string;
      }
    | undefined;
  const code = cause?.code?.toLowerCase() ?? '';
  const causeMessage = cause?.message?.toLowerCase() ?? '';

  return (
    message.includes('fetch failed') ||
    message.includes('timeout') ||
    code.includes('timeout') ||
    code.includes('econnreset') ||
    code.includes('enetunreach') ||
    code.includes('enotfound') ||
    code.includes('eai_again') ||
    causeMessage.includes('timeout')
  );
}

export function createOpenRouterProvider(config: OpenRouterConfig) {
  const fetchImpl = config.fetchImpl ?? fetch;
  const endpoint = `${trimTrailingSlash(config.baseUrl)}/chat/completions`;

  return {
    async generateStructuredObject(input: GenerateStructuredObjectInput): Promise<unknown> {
      let response: Response | null = null;
      let lastError: unknown;

      for (let attempt = 1; attempt <= OPENROUTER_MAX_FETCH_ATTEMPTS; attempt += 1) {
        try {
          const requestBody = JSON.stringify({
            model: config.model,
            plugins: [{ id: 'response-healing' }],
            response_format: {
              type: 'json_schema',
              json_schema: {
                name: input.schemaName,
                strict: true,
                schema: input.schema
              }
            },
            messages: [
              {
                role: 'system',
                content: input.systemPrompt
              },
              {
                role: 'user',
                content: input.prompt
              }
            ]
          });
          response = await fetchImpl(endpoint, {
            method: 'POST',
            headers: {
              authorization: `Bearer ${config.apiKey}`,
              'content-type': 'application/json'
            },
            signal: AbortSignal.timeout(OPENROUTER_REQUEST_TIMEOUT_MS),
            body: requestBody
          });
          break;
        } catch (error) {
          lastError = error;

          if (attempt === OPENROUTER_MAX_FETCH_ATTEMPTS || !isRetryableFetchError(error)) {
            const message = error instanceof Error ? error.message : 'Unknown fetch error.';
            const details = readFetchErrorDetails(error);
            throw new Error(
              `OpenRouter transport error after ${attempt} attempt(s): ${message}${details}`
            );
          }

          await sleep(OPENROUTER_RETRY_DELAY_MS * attempt);
        }
      }

      if (!response) {
        const message = lastError instanceof Error ? lastError.message : 'Unknown fetch error.';
        const details = readFetchErrorDetails(lastError);
        throw new Error(`OpenRouter transport error: ${message}${details}`);
      }

      if (!response.ok) {
        const errorText = await response.text();
        let providerMessage = '';

        try {
          const errorPayload = JSON.parse(errorText) as OpenRouterErrorResponse;
          providerMessage = errorPayload.error?.message?.trim() ?? '';
        } catch {
          providerMessage = '';
        }

        throw new Error(formatOpenRouterHttpError(response.status, providerMessage));
      }

      const payload = (await response.json()) as OpenRouterResponse;
      const content = readMessageContent(payload);

      try {
        return JSON.parse(content) as unknown;
      } catch {
        throw new Error('OpenRouter returned invalid JSON.');
      }
    }
  };
}
