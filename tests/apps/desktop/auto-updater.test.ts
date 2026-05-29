import { EventEmitter } from 'node:events';

import { afterEach, describe, expect, test, vi } from 'vitest';

import {
  DesktopAutoUpdater,
  type UpdateStatus
} from '../../../apps/desktop/src/main/auto-updater';

class FakeUpdater extends EventEmitter {
  autoDownload = false;
  readonly checkForUpdates = vi.fn(async () => undefined);
  readonly quitAndInstall = vi.fn();
}

describe('DesktopAutoUpdater', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  test('tracks update state and performs periodic checks', async () => {
    vi.useFakeTimers();

    const updater = new FakeUpdater();
    const observedStatuses: UpdateStatus[] = [];
    const desktopUpdater = new DesktopAutoUpdater(updater);
    desktopUpdater.onStatusChange((status) => {
      observedStatuses.push(status);
    });

    desktopUpdater.init();
    await Promise.resolve();

    updater.emit('checking-for-update');
    updater.emit('update-available', { version: '1.2.3' });
    updater.emit('update-downloaded', { version: '1.2.3' });
    updater.emit('error', new Error('network failed'));

    await vi.advanceTimersByTimeAsync(4 * 60 * 60 * 1000);

    expect(updater.autoDownload).toBe(true);
    expect(updater.checkForUpdates).toHaveBeenCalledTimes(2);
    expect(observedStatuses).toEqual(
      expect.arrayContaining([
        { state: 'idle' },
        { state: 'checking' },
        { state: 'available', version: '1.2.3' },
        { state: 'downloaded', version: '1.2.3' },
        { state: 'error', message: 'network failed' }
      ])
    );
  });
});
