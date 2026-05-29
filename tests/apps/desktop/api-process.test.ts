import { EventEmitter } from 'node:events';

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
});
