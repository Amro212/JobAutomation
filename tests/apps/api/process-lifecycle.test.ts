import { EventEmitter } from 'node:events';

import { describe, expect, test, vi } from 'vitest';

import { installChildProcessLifecycle } from '../../../apps/api/src/process-lifecycle';

class FakeProcess extends EventEmitter {
  readonly sent: unknown[] = [];
  readonly exit = vi.fn((code?: number) => code as never);

  send(message: unknown): void {
    this.sent.push(message);
  }
}

describe('child process lifecycle', () => {
  test('sends a ready message when requested', () => {
    const fakeProcess = new FakeProcess();
    const lifecycle = installChildProcessLifecycle(
      {
        close: vi.fn(async () => undefined)
      },
      fakeProcess
    );

    lifecycle.notifyReady();

    expect(fakeProcess.sent).toEqual([{ type: 'ready' }]);
    lifecycle.dispose();
  });

  test('closes the app and exits cleanly on shutdown message', async () => {
    const fakeProcess = new FakeProcess();
    const close = vi.fn(async () => undefined);
    const lifecycle = installChildProcessLifecycle(
      {
        close
      },
      fakeProcess
    );

    fakeProcess.emit('message', { type: 'shutdown' });
    await new Promise((resolve) => setImmediate(resolve));

    expect(close).toHaveBeenCalledTimes(1);
    expect(fakeProcess.exit).toHaveBeenCalledWith(0);
    lifecycle.dispose();
  });
});
