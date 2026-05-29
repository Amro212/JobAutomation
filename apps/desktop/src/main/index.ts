import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  app,
  BrowserWindow,
  ipcMain,
  Notification,
  type BrowserWindowConstructorOptions
} from 'electron';
import type Store from 'electron-store';

import { DesktopAutoUpdater } from './auto-updater.js';
import { ApiProcessManager } from './api-process.js';
import { CamoufoxManager } from './camoufox-manager.js';
import {
  createDesktopConfigStore,
  findAvailableApiPort,
  type DesktopConfig
} from './config-store.js';
import { TrayController } from './tray.js';

let mainWindow: BrowserWindow | null = null;
let trayController: TrayController | null = null;
let isQuitting = false;
let autopilotStatus = 'Idle';
const autoUpdater = new DesktopAutoUpdater();
let configStore: Store<DesktopConfig>;
let camoufoxManager: CamoufoxManager;

const currentDir = path.dirname(fileURLToPath(import.meta.url));

function getWindowOptions(store: { get: <K extends keyof DesktopConfig>(key: K) => DesktopConfig[K] }): BrowserWindowConstructorOptions {
  const bounds = store.get('windowBounds');

  return {
    width: bounds?.width ?? 1440,
    height: bounds?.height ?? 900,
    ...(bounds ? { x: bounds.x, y: bounds.y } : {}),
    minWidth: 1100,
    minHeight: 700,
    show: false,
    backgroundColor: '#0b1020',
    webPreferences: {
      preload: path.resolve(currentDir, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  };
}

function getRendererEntry(): string {
  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  if (devServerUrl) {
    return devServerUrl;
  }

  return `file://${path.resolve(app.getAppPath(), 'dist/renderer/index.html')}`;
}

async function createMainWindow(): Promise<BrowserWindow> {
  const window = new BrowserWindow(getWindowOptions(configStore));
  const entry = getRendererEntry();

  if (entry.startsWith('file://')) {
    await window.loadURL(entry);
  } else {
    await window.loadURL(entry);
  }

  window.on('close', (event) => {
    if (isQuitting) {
      return;
    }

    event.preventDefault();
    window.hide();

    if (Notification.isSupported()) {
      new Notification({
        title: 'JobAutomation',
        body: 'App is still running in the background.'
      }).show();
    }
  });

  window.on('resized', () => {
    configStore.set('windowBounds', window.getBounds());
  });
  window.on('moved', () => {
    configStore.set('windowBounds', window.getBounds());
  });

  return window;
}

async function stopActiveAutopilot(apiBaseUrl: string): Promise<void> {
  const response = await fetch(`${apiBaseUrl}/autopilot-runs`);
  if (!response.ok) {
    return;
  }

  const payload = (await response.json()) as {
    runs: Array<{ run: { id: string; status: string } }>;
  };
  const activeRun = payload.runs.find(
    (entry) => entry.run.status === 'running' || entry.run.status === 'pending'
  );

  if (!activeRun) {
    return;
  }

  await fetch(`${apiBaseUrl}/autopilot-runs/${activeRun.run.id}/cancel`, {
    method: 'POST'
  });
}

async function bootstrap(): Promise<void> {
  const gotLock = app.requestSingleInstanceLock();
  if (!gotLock) {
    app.quit();
    return;
  }

  app.on('second-instance', () => {
    if (!mainWindow) {
      return;
    }

    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }

    mainWindow.show();
    mainWindow.focus();
  });

  await app.whenReady();
  autoUpdater.init();
  configStore = createDesktopConfigStore();
  camoufoxManager = new CamoufoxManager(configStore);
  await camoufoxManager.ensureBinaryReady();

  const apiHost = configStore.get('apiHost');
  const apiPort = await findAvailableApiPort(apiHost, configStore.get('apiPort'));
  configStore.set('apiPort', apiPort);

  const apiProcess = new ApiProcessManager({
    apiHost,
    apiPort,
    dbPath: configStore.get('dbPath'),
    desktopRoot: app.getAppPath(),
    packaged: app.isPackaged
  });

  ipcMain.handle('get-app-version', () => app.getVersion());
  ipcMain.handle('get-api-port', () => apiPort);
  ipcMain.handle('get-platform', () => process.platform);
  ipcMain.handle('get-update-status', () => autoUpdater.getStatus());
  ipcMain.handle('install-update', () => {
    autoUpdater.install();
  });
  ipcMain.on('minimize-to-tray', () => {
    mainWindow?.hide();
  });

  await apiProcess.start();

  mainWindow = await createMainWindow();
  trayController = new TrayController({
    getWindow: () => mainWindow,
    getAutopilotStatus: () => autopilotStatus,
    onStopAutopilot: async () => {
      await stopActiveAutopilot(apiProcess.apiBaseUrl);
      autopilotStatus = 'Stopping';
      trayController?.refreshMenu();
    },
    onCheckForUpdates: async () => {
      await autoUpdater.checkNow();
    },
    onQuit: async () => {
      isQuitting = true;
      await apiProcess.stop();
      app.quit();
    }
  });
  trayController.create();

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  app.on('activate', async () => {
    if (!mainWindow) {
      mainWindow = await createMainWindow();
    }

    mainWindow.show();
    mainWindow.focus();
  });

  app.on('before-quit', async () => {
    isQuitting = true;
    await apiProcess.stop();
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });
}

void bootstrap();
