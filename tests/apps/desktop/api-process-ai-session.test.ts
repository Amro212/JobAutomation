import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, test, vi } from 'vitest';

import { ApiProcessManager } from '../../../apps/desktop/src/main/api-process';

describe('ApiProcessManager AI session env', () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { force: true, recursive: true });
    }
  });

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

  test('loads repo .env values for the forked local API in dev mode', async () => {
    const workspaceRoot = mkdtempSync(join(tmpdir(), 'jobautomation-env-'));
    tempDirs.push(workspaceRoot);
    writeFileSync(
      join(workspaceRoot, '.env'),
      [
        'OPENROUTER_API_KEY=local-dev-key',
        'OPENROUTER_JOB_SUMMARY_MODEL=openrouter/test-model',
        'JOBAUTOMATION_ALLOW_STATIC_ARTIFACT_FALLBACK=1'
      ].join('\n')
    );

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
      workspaceRoot,
      packaged: false,
      childFactory,
      healthCheck: vi.fn().mockResolvedValue(undefined)
    });

    await manager.start();

    expect(childFactory).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        env: expect.objectContaining({
          OPENROUTER_API_KEY: 'local-dev-key',
          OPENROUTER_JOB_SUMMARY_MODEL: 'openrouter/test-model',
          JOBAUTOMATION_ALLOW_STATIC_ARTIFACT_FALLBACK: '1'
        })
      })
    );
  });
});
