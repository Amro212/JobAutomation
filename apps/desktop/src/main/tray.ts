import {
  Menu,
  Tray,
  type BrowserWindow,
  type MenuItemConstructorOptions
} from 'electron';

import { loadAppIcon } from './app-icon.js';

export type TrayControllerOptions = {
  getWindow: () => BrowserWindow | null;
  getAutopilotStatus: () => string;
  canStopAutopilot: () => boolean;
  onStopAutopilot: () => Promise<void>;
  onCheckForUpdates: () => Promise<void>;
  onQuit: () => Promise<void>;
};

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

    this.tray = new Tray(loadAppIcon());
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
        enabled: this.options.canStopAutopilot(),
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
