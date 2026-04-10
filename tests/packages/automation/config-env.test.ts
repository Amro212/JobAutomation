import { describe, expect, test } from 'vitest';

import { readEnv } from '../../../packages/config/src/env';

describe('stage four env configuration', () => {
  test('reads summary and stage four model names from environment variables', () => {
    const env = readEnv({
      OPENROUTER_API_KEY: 'test-key',
      OPENROUTER_JOB_SUMMARY_MODEL: 'google/gemini-2.0-flash-lite-001',
      OPENROUTER_APPLICATION_FILL_PLAN_MODEL: 'openai/o4-mini'
    });

    expect(env.OPENROUTER_JOB_SUMMARY_MODEL).toBe('google/gemini-2.0-flash-lite-001');
    expect(env.OPENROUTER_APPLICATION_FILL_PLAN_MODEL).toBe('openai/o4-mini');
  });
});
