import { afterAll, describe, expect, test } from 'vitest';

import { buildApp } from '../../../apps/api/src/app';

describe('health route', () => {
  const app = buildApp();

  afterAll(async () => {
    await app.close();
  });

  test('returns ok', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/health'
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true });
  });
});
