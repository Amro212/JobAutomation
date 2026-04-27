import { describe, expect, test } from 'vitest';

import { createOpenRouterProvider } from '../../../packages/llm/src/provider';

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      'content-type': 'application/json'
    },
    ...init
  });
}

function createRequest() {
  return {
    schemaName: 'tailoring-output',
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['value'],
      properties: {
        value: {
          type: 'string'
        }
      }
    },
    systemPrompt: 'Return JSON.',
    prompt: 'Return a value.'
  };
}

describe('OpenRouter provider', () => {
  test('sends the supplied JSON Schema as the response format', async () => {
    let requestBody: unknown;
    const provider = createOpenRouterProvider({
      apiKey: 'test-key',
      baseUrl: 'https://openrouter.test/api/v1',
      model: 'test/model',
      fetchImpl: async (_url, init) => {
        requestBody = JSON.parse(String(init?.body));
        return jsonResponse({
          choices: [
            {
              message: {
                content: '{"value":"ok"}'
              }
            }
          ]
        });
      }
    });

    await expect(provider.generateStructuredObject(createRequest())).resolves.toEqual({ value: 'ok' });
    expect(requestBody).toMatchObject({
      model: 'test/model',
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'tailoring-output',
          strict: true,
          schema: createRequest().schema
        }
      }
    });
  });

  test('parses JSON wrapped in a markdown fence or short prose', async () => {
    const provider = createOpenRouterProvider({
      apiKey: 'test-key',
      baseUrl: 'https://openrouter.test/api/v1',
      model: 'test/model',
      fetchImpl: async () =>
        jsonResponse({
          choices: [
            {
              message: {
                content: '```json\n{"value":"from-fence"}\n```'
              }
            }
          ]
        })
    });

    await expect(provider.generateStructuredObject(createRequest())).resolves.toEqual({
      value: 'from-fence'
    });

    const proseProvider = createOpenRouterProvider({
      apiKey: 'test-key',
      baseUrl: 'https://openrouter.test/api/v1',
      model: 'test/model',
      fetchImpl: async () =>
        jsonResponse({
          choices: [
            {
              message: {
                content: 'Here is the JSON:\n{"value":"from-prose"}'
              }
            }
          ]
        })
    });

    await expect(proseProvider.generateStructuredObject(createRequest())).resolves.toEqual({
      value: 'from-prose'
    });

    const trailingProseProvider = createOpenRouterProvider({
      apiKey: 'test-key',
      baseUrl: 'https://openrouter.test/api/v1',
      model: 'test/model',
      fetchImpl: async () =>
        jsonResponse({
          choices: [
            {
              message: {
                content: '{"value":"from-trailing-prose"}\nDone.'
              }
            }
          ]
        })
    });

    await expect(trailingProseProvider.generateStructuredObject(createRequest())).resolves.toEqual({
      value: 'from-trailing-prose'
    });
  });

  test('falls back to json_object when a model rejects json_schema response_format', async () => {
    const responseFormats: unknown[] = [];
    const provider = createOpenRouterProvider({
      apiKey: 'test-key',
      baseUrl: 'https://openrouter.test/api/v1',
      model: 'test/model',
      fetchImpl: async (_url, init) => {
        const body = JSON.parse(String(init?.body)) as { response_format: unknown };
        responseFormats.push(body.response_format);

        if (responseFormats.length === 1) {
          return jsonResponse(
            {
              error: {
                message: 'response_format json_schema is not supported by this model'
              }
            },
            { status: 400 }
          );
        }

        return jsonResponse({
          choices: [
            {
              message: {
                content: '{"value":"fallback"}'
              }
            }
          ]
        });
      }
    });

    await expect(provider.generateStructuredObject(createRequest())).resolves.toEqual({
      value: 'fallback'
    });
    expect(responseFormats).toEqual([
      {
        type: 'json_schema',
        json_schema: {
          name: 'tailoring-output',
          strict: true,
          schema: createRequest().schema
        }
      },
      {
        type: 'json_object'
      }
    ]);
  });
});
