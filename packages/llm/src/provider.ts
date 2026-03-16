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

export function createOpenRouterProvider(config: OpenRouterConfig) {
  const fetchImpl = config.fetchImpl ?? fetch;
  const endpoint = `${trimTrailingSlash(config.baseUrl)}/chat/completions`;

  return {
    async generateStructuredObject(input: GenerateStructuredObjectInput): Promise<unknown> {
      const response = await fetchImpl(endpoint, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${config.apiKey}`,
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          model: config.model,
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
        })
      });

      if (!response.ok) {
        throw new Error(`OpenRouter request failed with status ${response.status}.`);
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
