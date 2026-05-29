import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  Menu,
  Tray,
  nativeImage,
  type BrowserWindow,
  type MenuItemConstructorOptions
} from 'electron';

export type TrayControllerOptions = {
  getWindow: () => BrowserWindow | null;
  getAutopilotStatus: () => string;
  onStopAutopilot: () => Promise<void>;
  onCheckForUpdates: () => Promise<void>;
  onQuit: () => Promise<void>;
};

function resolveTrayIcon(): Electron.NativeImage {
  const iconPath = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../../build/icon.png'
  );
  return nativeImage.createFromPath(iconPath).isEmpty()
    ? nativeImage.createEmpty()
    : nativeImage.createFromPath(iconPath);
}

export class TrayController {
  private tray: Tray | null = null;
  private readonly options: TrayControllerOptions;

  constructor(options: TrayControllerOptions) {
    this.options = options;
  }

  create(): void {
    if (this.tray) {
      return;
    }

    this.tray = new Tray(resolveTrayIcon());
    this.tray.setToolTip(`JobAutomation - ${this.options.getAutopilotStatus()}`);
    this.tray.on('double-click', () => {
      const window = this.options.getWindow();
      if (!window) {
        return;
      }

      if (window.isMinimized()) {
        window.restore();
      }

      window.show();
      window.focus();
    });
    this.refreshMenu();
  }

  refreshMenu(): void {
    if (!this.tray) {
      return;
    }

    const menuTemplate: MenuItemConstructorOptions[] = [
      {
        label: 'Open Dashboard',
        click: () => {
          const window = this.options.getWindow();
          if (!window) {
            return;
          }

          window.show();
          window.focus();
        }
      },
      {
        label: `Autopilot Status: ${this.options.getAutopilotStatus()}`,
        enabled: false
      },
      {
        label: 'Stop Autopilot',
        click: () => {
          void this.options.onStopAutopilot();
        }
      },
      {
        type: 'separator'
      },
      {
        label: 'Check for Updates',
        click: () => {
          void this.options.onCheckForUpdates();
        }
      },
      {
        label: 'Quit',
        click: () => {
          void this.options.onQuit();
        }
      }
    ];

    this.tray.setContextMenu(Menu.buildFromTemplate(menuTemplate));
    this.tray.setToolTip(`JobAutomation - ${this.options.getAutopilotStatus()}`);
  }

  destroy(): void {
    this.tray?.destroy();
    this.tray = null;
  }
}
