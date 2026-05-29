export type OpenRouterConfig = {
  apiKey: string;
  baseUrl: string;
  model: string;
  reasoning?: {
    enabled?: boolean;
    exclude?: boolean;
    effort?: 'xhigh' | 'high' | 'medium' | 'low' | 'minimal' | 'none';
    max_tokens?: number;
  };
  fetchImpl?: typeof fetch;
};

export type GenerateStructuredObjectInput = {
  schemaName: string;
  schema: Record<string, unknown>;
  systemPrompt: string;
  prompt: string;
};

export type GenerateStructuredObjectResult = {
  object: unknown;
  rawText: string;
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

type OpenRouterResponseFormat =
  | {
      type: 'json_object';
    }
  | {
      type: 'json_schema';
      json_schema: {
        name: string;
        strict: true;
        schema: Record<string, unknown>;
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

function stripMarkdownJsonFence(text: string): string {
  const trimmed = text.trim();
  const fenceMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenceMatch?.[1]?.trim() ?? trimmed;
}

function extractJsonCandidate(text: string): string | null {
  const stripped = stripMarkdownJsonFence(text);

  let start = -1;
  let stack: string[] = [];
  let inString = false;
  let escaped = false;

  for (let i = 0; i < stripped.length; i += 1) {
    const char = stripped[i]!;

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === '\\' && inString) {
      escaped = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (inString) {
      continue;
    }

    if (char === '{' || char === '[') {
      if (stack.length === 0) {
        start = i;
      }
      stack.push(char);
      continue;
    }

    if (char !== '}' && char !== ']') {
      continue;
    }

    const opener = stack.at(-1);
    if ((char === '}' && opener !== '{') || (char === ']' && opener !== '[')) {
      start = -1;
      stack = [];
      continue;
    }

    stack.pop();
    if (stack.length === 0 && start >= 0) {
      return stripped.slice(start, i + 1).trim();
    }
  }

  return null;
}

function parseStructuredJson(content: string): unknown {
  const stripped = stripMarkdownJsonFence(content);

  try {
    return JSON.parse(stripped) as unknown;
  } catch {
    // Some models ignore JSON-only instructions and wrap the object in prose.
  }

  const candidate = extractJsonCandidate(content);

  if (!candidate) {
    throw new Error('OpenRouter returned invalid JSON.');
  }

  try {
    return JSON.parse(candidate) as unknown;
  } catch {
    throw new Error('OpenRouter returned invalid JSON.');
  }
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

function buildResponseFormat(input: GenerateStructuredObjectInput): OpenRouterResponseFormat {
  return {
    type: 'json_schema',
    json_schema: {
      name: input.schemaName,
      strict: true,
      schema: input.schema
    }
  };
}

function shouldRetryWithJsonObject(status: number, details: string): boolean {
  const normalized = details.toLowerCase();

  return (
    status === 400 &&
    (normalized.includes('response_format') ||
      normalized.includes('json_schema') ||
      normalized.includes('structured output') ||
      normalized.includes('structured outputs') ||
      normalized.includes('not support') ||
      normalized.includes('unsupported'))
  );
}

export function createOpenRouterProvider(config: OpenRouterConfig) {
  const fetchImpl = config.fetchImpl ?? fetch;
  const endpoint = `${trimTrailingSlash(config.baseUrl)}/chat/completions`;

  async function requestStructuredObject(
    input: GenerateStructuredObjectInput,
    responseFormat: OpenRouterResponseFormat
  ): Promise<Response> {
    let response: Response | null = null;
    let lastError: unknown;

    for (let attempt = 1; attempt <= OPENROUTER_MAX_FETCH_ATTEMPTS; attempt += 1) {
      try {
        response = await fetchImpl(endpoint, {
          method: 'POST',
          headers: {
            authorization: `Bearer ${config.apiKey}`,
            'content-type': 'application/json'
          },
          signal: AbortSignal.timeout(OPENROUTER_REQUEST_TIMEOUT_MS),
          body: JSON.stringify({
            model: config.model,
            response_format: responseFormat,
            ...(config.reasoning ? { reasoning: config.reasoning } : {}),
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
          })
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

    return response;
  }

  async function readErrorDetails(response: Response): Promise<string> {
    try {
      const errorPayload = (await response.json()) as OpenRouterErrorResponse;
      const message = errorPayload.error?.message?.trim();
      if (message) {
        return `: ${message}`;
      }
    } catch {
      return '';
    }

    return '';
  }

  async function generateStructuredObjectWithMetadata(
    input: GenerateStructuredObjectInput
  ): Promise<GenerateStructuredObjectResult> {
    let response = await requestStructuredObject(input, buildResponseFormat(input));

    if (!response.ok) {
      const details = await readErrorDetails(response);

      if (shouldRetryWithJsonObject(response.status, details)) {
        response = await requestStructuredObject(input, { type: 'json_object' });
      }

      if (!response.ok) {
        const fallbackDetails = response.bodyUsed ? details : await readErrorDetails(response);
        throw new Error(`OpenRouter request failed with status ${response.status}${fallbackDetails}.`);
      }
    }

    const payload = (await response.json()) as OpenRouterResponse;
    const content = readMessageContent(payload);

    return {
      object: parseStructuredJson(content),
      rawText: content
    };
  }

  return {
    generateStructuredObjectWithMetadata,
    async generateStructuredObject(input: GenerateStructuredObjectInput): Promise<unknown> {
      return (await generateStructuredObjectWithMetadata(input)).object;
    }
  };
}
