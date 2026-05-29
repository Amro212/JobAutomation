import { autoUpdater } from 'electron-updater';

export type UpdateStatus =
  | { state: 'idle' }
  | { state: 'checking' }
  | { state: 'available'; version: string }
  | { state: 'downloaded'; version: string }
  | { state: 'error'; message: string };

export class DesktopAutoUpdater {
  private status: UpdateStatus = { state: 'idle' };

  getStatus(): UpdateStatus {
    return this.status;
  }

  init(): void {
    autoUpdater.autoDownload = true;

    autoUpdater.on('checking-for-update', () => {
      this.status = { state: 'checking' };
    });

    autoUpdater.on('update-available', (info) => {
      this.status = { state: 'available', version: info.version };
    });

    autoUpdater.on('update-downloaded', (info) => {
      this.status = { state: 'downloaded', version: info.version };
    });

    autoUpdater.on('error', (error) => {
      this.status = { state: 'error', message: error.message };
    });
  }

  async checkNow(): Promise<void> {
    await autoUpdater.checkForUpdates();
  }

  install(): void {
    autoUpdater.quitAndInstall();
  }
}
