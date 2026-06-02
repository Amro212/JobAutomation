import { describe, expect, test, vi } from 'vitest';

import { ApiProcessManager } from '../../../apps/desktop/src/main/api-process';

describe('ApiProcessManager AI session env', () => {
  test('passes hosted AI gateway config to the forked local API', async () => {
    const child = {
      send: vi.fn(),
      kill: vi.fn(),
      on: vi.fn(),
      once: vi.fn(),
      off: vi.fn(),
      stdout: { on: vi.fn() },
      stderr: { on: vi.fn() }
    };
    const childFactory = vi.fn(() => child);

    const manager = new ApiProcessManager({
      apiHost: '127.0.0.1',
      apiPort: 3001,
      dbPath: 'C:\\data\\jobautomation.sqlite',
      desktopRoot: 'C:\\desktop',
      packaged: false,
      aiGatewayBaseUrl: 'https://ai.example.test',
      aiAuthToken: 'user-session-token',
      childFactory,
      healthCheck: vi.fn().mockResolvedValue(undefined)
    });

    await manager.start();

    expect(childFactory).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        env: expect.objectContaining({
          JOBAUTOMATION_AI_GATEWAY_BASE_URL: 'https://ai.example.test',
          JOBAUTOMATION_AI_AUTH_TOKEN: 'user-session-token'
        })
      })
    );
  });
});
