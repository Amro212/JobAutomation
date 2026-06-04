import { EventEmitter } from 'node:events';
import path from 'node:path';

import { afterEach, describe, expect, test, vi } from 'vitest';

import {
  ApiProcessManager,
  type ApiProcessState
} from '../../../apps/desktop/src/main/api-process';

class FakeChildProcess extends EventEmitter {
  stdout = new EventEmitter();
  stderr = new EventEmitter();
  readonly sentMessages: unknown[] = [];
  readonly killedSignals: Array<NodeJS.Signals | undefined> = [];

  send(message: unknown): void {
    this.sentMessages.push(message);
  }

  kill(signal?: NodeJS.Signals): void {
    this.killedSignals.push(signal);
    this.emit('exit', null, signal ?? null);
  }
}

describe('ApiProcessManager', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  test('restarts the API process with backoff after an unexpected exit', async () => {
    vi.useFakeTimers();

    const states: ApiProcessState[] = [];
    const firstChild = new FakeChildProcess();
    const secondChild = new FakeChildProcess();
    const childFactory = vi
      .fn()
      .mockReturnValueOnce(firstChild)
      .mockReturnValueOnce(secondChild);
    const healthCheck = vi.fn().mockResolvedValue(undefined);

    const manager = new ApiProcessManager({
      apiHost: '127.0.0.1',
      apiPort: 3001,
      dbPath: 'C:\\data\\jobautomation.sqlite',
      desktopRoot: 'C:\\desktop',
      packaged: false,
      restartBaseDelayMs: 100,
      childFactory,
      healthCheck,
      onStateChange: (state) => {
        states.push(state);
      }
    });

    const startPromise = manager.start();
    firstChild.emit('message', { type: 'ready' });
    await startPromise;

    firstChild.emit('exit', 1, null);
    await vi.advanceTimersByTimeAsync(100);

    const restartPromise = Promise.resolve().then(async () => {
      secondChild.emit('message', { type: 'ready' });
      await Promise.resolve();
    });
    await restartPromise;

    expect(childFactory).toHaveBeenCalledTimes(2);
    expect(healthCheck).toHaveBeenCalledTimes(2);
    expect(states).toEqual(
      expect.arrayContaining([
        { status: 'starting' },
        { status: 'running' },
        { status: 'restarting', attempt: 1, delayMs: 100 },
        { status: 'starting' },
        { status: 'running' }
      ])
    );
  });

  test('includes recent child output when API startup times out', async () => {
    vi.useFakeTimers();

    const child = new FakeChildProcess();
    const healthCheck = vi.fn(() => new Promise<void>(() => {}));

    const manager = new ApiProcessManager({
      apiHost: '127.0.0.1',
      apiPort: 3001,
      dbPath: 'C:\\data\\jobautomation.sqlite',
      desktopRoot: 'C:\\desktop',
      packaged: false,
      childFactory: vi.fn(() => child),
      healthCheck
    });

    const startPromise = manager.start();
    child.stderr.emit(
      'data',
      Buffer.from('Error: Dynamic require of "fastify-plugin" is not supported\n')
    );

    const rejection = expect(startPromise).rejects.toThrow(
      /API process did not report ready in time\.[\s\S]*fastify-plugin/
    );
    await vi.advanceTimersByTimeAsync(15_000);
    await rejection;

    expect(manager.getState()).toEqual({
      status: 'error',
      message: expect.stringContaining('fastify-plugin')
    });
  });

  test('uses packaged cjs API entry and asar node paths', async () => {
    const originalResourcesPath = (process as NodeJS.Process & { resourcesPath?: string })
      .resourcesPath;
    Object.defineProperty(process, 'resourcesPath', {
      configurable: true,
      value: 'C:\\resources'
    });

    try {
      const child = new FakeChildProcess();
      const childFactory = vi.fn(() => child);

      const manager = new ApiProcessManager({
        apiHost: '127.0.0.1',
        apiPort: 3001,
        dbPath: 'C:\\data\\jobautomation.sqlite',
        desktopRoot: 'C:\\resources\\app.asar',
        packaged: true,
        childFactory,
        healthCheck: vi.fn().mockResolvedValue(undefined)
      });

      await manager.start();

      expect(childFactory).toHaveBeenCalledWith(
        'C:\\resources\\api\\index.cjs',
        expect.objectContaining({
          cwd: path.dirname(process.execPath),
          env: expect.objectContaining({
            ELECTRON_RUN_AS_NODE: '1',
            NODE_PATH: expect.stringContaining('C:\\resources\\app.asar\\node_modules'),
            JOB_AUTOMATION_AUTOPILOT_WORKER_ENTRY:
              'C:\\resources\\api\\workers\\autopilot-worker.cjs'
          })
        })
      );
    } finally {
      Object.defineProperty(process, 'resourcesPath', {
        configurable: true,
        value: originalResourcesPath
      });
    }
  });
});
