import pkg from 'electron-updater';
const { autoUpdater } = pkg;

type AutoUpdaterLike = Pick<
  typeof autoUpdater,
  'autoDownload' | 'checkForUpdates' | 'quitAndInstall' | 'on'
>;

export type UpdateStatus =
  | { state: 'idle' }
  | { state: 'checking' }
  | { state: 'available'; version: string }
  | { state: 'downloaded'; version: string }
  | { state: 'error'; message: string };

export class DesktopAutoUpdater {
  private status: UpdateStatus = { state: 'idle' };
  private readonly listeners = new Set<(status: UpdateStatus) => void>();
  private readonly updater: AutoUpdaterLike;
  private checkInterval: ReturnType<typeof setInterval> | null = null;

  constructor(updater: AutoUpdaterLike = autoUpdater) {
    this.updater = updater;
  }

  getStatus(): UpdateStatus {
    return this.status;
  }

  onStatusChange(listener: (status: UpdateStatus) => void): () => void {
    this.listeners.add(listener);
    listener(this.status);
    return () => {
      this.listeners.delete(listener);
    };
  }

  init(): void {
    if (process.env.JOB_AUTOMATION_DISABLE_AUTO_UPDATES === '1') {
      return;
    }

    this.updater.autoDownload = true;

    this.updater.on('checking-for-update', () => {
      this.setStatus({ state: 'checking' });
    });

    this.updater.on('update-available', (info) => {
      this.setStatus({ state: 'available', version: info.version });
    });

    this.updater.on('update-downloaded', (info) => {
      this.setStatus({ state: 'downloaded', version: info.version });
    });

    this.updater.on('error', (error) => {
      this.setStatus({ state: 'error', message: error.message });
    });

    void this.checkNow().catch(() => null);
    this.checkInterval = setInterval(() => {
      void this.checkNow().catch(() => null);
    }, 4 * 60 * 60 * 1000);
  }

  async checkNow(): Promise<void> {
    await this.updater.checkForUpdates();
  }

  install(): void {
    this.updater.quitAndInstall();
  }

  dispose(): void {
    if (!this.checkInterval) {
      return;
    }

    clearInterval(this.checkInterval);
    this.checkInterval = null;
  }

  private setStatus(status: UpdateStatus): void {
    this.status = status;
    for (const listener of this.listeners) {
      listener(status);
    }
  }
}
