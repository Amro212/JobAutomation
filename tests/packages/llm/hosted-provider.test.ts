import { describe, expect, test, vi } from 'vitest';

import { HostedAiGatewayError, createHostedAiGatewayProvider } from '../../../packages/llm/src';

describe('hosted AI gateway provider', () => {
  test('sends structured-object requests with bearer auth', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({
          object: { ok: true },
          rawText: '{"ok":true}'
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    );

    const provider = createHostedAiGatewayProvider({
      baseUrl: 'https://ai.example.test',
      authToken: 'session-token',
      fetchImpl
    });

    await expect(
      provider.generateStructuredObject({
        schemaName: 'test_schema',
        schema: { type: 'object' },
        systemPrompt: 'system',
        prompt: 'prompt'
      })
    ).resolves.toEqual({ ok: true });

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://ai.example.test/v1/structured-object',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          authorization: 'Bearer session-token',
          'content-type': 'application/json'
        })
      })
    );
  });

  test('reports subscription failures distinctly', async () => {
    const provider = createHostedAiGatewayProvider({
      baseUrl: 'https://ai.example.test',
      authToken: 'session-token',
      fetchImpl: vi.fn(async () =>
        new Response(JSON.stringify({ message: 'Subscription inactive.' }), {
          status: 402,
          headers: { 'content-type': 'application/json' }
        })
      )
    });

    await expect(
      provider.generateStructuredObject({
        schemaName: 'test_schema',
        schema: { type: 'object' },
        systemPrompt: 'system',
        prompt: 'prompt'
      })
    ).rejects.toMatchObject({
      code: 'subscription_required',
      status: 402
    } satisfies Partial<HostedAiGatewayError>);
  });

  test('rejects invalid gateway responses', async () => {
    const provider = createHostedAiGatewayProvider({
      baseUrl: 'https://ai.example.test/api',
      authToken: 'session-token',
      fetchImpl: vi.fn(async () =>
        new Response(JSON.stringify({ rawText: '{}' }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        })
      )
    });

    await expect(
      provider.generateStructuredObject({
        schemaName: 'test_schema',
        schema: { type: 'object' },
        systemPrompt: 'system',
        prompt: 'prompt'
      })
    ).rejects.toMatchObject({
      code: 'invalid_output'
    } satisfies Partial<HostedAiGatewayError>);
  });

  test('requires an auth token', () => {
    expect(() =>
      createHostedAiGatewayProvider({
        baseUrl: 'https://ai.example.test',
        authToken: ''
      })
    ).toThrow('Hosted AI gateway auth token is missing.');
  });
});
