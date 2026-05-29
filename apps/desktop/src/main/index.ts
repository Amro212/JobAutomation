import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  app,
  BrowserWindow,
  ipcMain,
  Notification,
  dialog,
  type BrowserWindowConstructorOptions
} from 'electron';
import type Store from 'electron-store';

import { DesktopAutoUpdater } from './auto-updater.js';
import { ApiProcessManager } from './api-process.js';
import {
  CamoufoxManager,
  type CamoufoxDownloadStatus
} from './camoufox-manager.js';
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
let hasActiveAutopilot = false;
let backendStatus: import('./api-process.js').ApiProcessState = { status: 'stopped' };
const autoUpdater = new DesktopAutoUpdater();
let configStore: Store<DesktopConfig>;
let camoufoxManager: CamoufoxManager;
let backendStatusBroadcastUnsubscribe: (() => void) | null = null;
let autopilotPollTimer: ReturnType<typeof setInterval> | null = null;
let autopilotPollInFlight = false;
let camoufoxStatus: CamoufoxDownloadStatus = {
  state: 'idle',
  message: 'Camoufox setup pending.'
};

function debugLog(message: string): void {
  if (process.env.JOB_AUTOMATION_DESKTOP_DEBUG === '1') {
    console.error(`[desktop-debug] ${message}`);
  }
}

function broadcastToRenderer(channel: string, payload: unknown): void {
  mainWindow?.webContents.send(channel, payload);
}

function refreshDesktopStatus(): void {
  trayController?.refreshMenu();
  broadcastToRenderer('backend-status', backendStatus);
  broadcastToRenderer('camoufox-download-progress', camoufoxStatus);
}

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

function clearAutopilotPolling(): void {
  if (!autopilotPollTimer) {
    autopilotPollInFlight = false;
    return;
  }

  clearInterval(autopilotPollTimer);
  autopilotPollTimer = null;
  autopilotPollInFlight = false;
}

async function refreshAutopilotStatus(apiBaseUrl: string): Promise<void> {
  if (autopilotPollInFlight) {
    return;
  }

  autopilotPollInFlight = true;

  try {
    const response = await fetch(`${apiBaseUrl}/autopilot-runs`);
    if (!response.ok) {
      return;
    }

    const payload = (await response.json()) as {
      runs: Array<{
        run: {
          id: string;
          status: string;
          currentStep: string;
          submittedCount: number;
        };
      }>;
    };

    const activeRun = payload.runs.find(
      (entry) => entry.run.status === 'running' || entry.run.status === 'pending'
    )?.run;

    if (!activeRun) {
      hasActiveAutopilot = false;
      autopilotStatus = 'Idle';
      refreshDesktopStatus();
      return;
    }

    hasActiveAutopilot = true;
    autopilotStatus = `${activeRun.status} | ${activeRun.currentStep} | submitted ${activeRun.submittedCount}`;
    refreshDesktopStatus();
  } catch {
    // Keep the last known tray state if the backend is temporarily unreachable.
  } finally {
    autopilotPollInFlight = false;
  }
}

function startAutopilotPolling(apiBaseUrl: string): void {
  clearAutopilotPolling();
  void refreshAutopilotStatus(apiBaseUrl);
  autopilotPollTimer = setInterval(() => {
    void refreshAutopilotStatus(apiBaseUrl);
  }, 5_000);
}

async function bootstrap(): Promise<void> {
  debugLog('bootstrap:start');
  const gotLock = app.requestSingleInstanceLock();
  if (!gotLock) {
    debugLog('bootstrap:no-lock');
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
  debugLog('bootstrap:ready');
  autoUpdater.init();
  configStore = createDesktopConfigStore();
  camoufoxManager = new CamoufoxManager(configStore, {
    onStatusChange: (status) => {
      camoufoxStatus = status;
      broadcastToRenderer('camoufox-download-progress', status);
    }
  });
  camoufoxStatus = camoufoxManager.getStatus();
  debugLog('bootstrap:config-ready');

  const apiHost = configStore.get('apiHost');
  const apiPort = await findAvailableApiPort(apiHost, configStore.get('apiPort'));
  configStore.set('apiPort', apiPort);

  const apiProcess = new ApiProcessManager({
    apiHost,
    apiPort,
    dbPath: configStore.get('dbPath'),
    desktopRoot: app.getAppPath(),
    packaged: app.isPackaged,
    onStateChange: (state) => {
      backendStatus = state;
      if (state.status === 'running') {
        startAutopilotPolling(apiProcess.apiBaseUrl);
      } else if (state.status === 'starting' || state.status === 'restarting') {
        hasActiveAutopilot = false;
        autopilotStatus = 'Waiting for backend';
        clearAutopilotPolling();
      } else {
        hasActiveAutopilot = false;
        autopilotStatus = 'Idle';
        clearAutopilotPolling();
      }
      refreshDesktopStatus();

      if (state.status === 'restarting' && Notification.isSupported()) {
        new Notification({
          title: 'JobAutomation',
          body: 'Backend restarting...'
        }).show();
      }

      if (state.status === 'error') {
        console.error(`Desktop backend error: ${state.message}`);
        if (process.env.JOB_AUTOMATION_DESKTOP_TEST !== '1') {
          void dialog.showErrorBox('Backend Error', state.message);
        }
      }
    }
  });

  backendStatusBroadcastUnsubscribe = autoUpdater.onStatusChange((status) => {
    broadcastToRenderer('update-status', status);
    if (status.state === 'available') {
      broadcastToRenderer('update-available', status);
    } else if (status.state === 'downloaded') {
      broadcastToRenderer('update-downloaded', status);
    } else if (status.state === 'error') {
      broadcastToRenderer('update-error', status);
    }
  });

  ipcMain.handle('get-app-version', () => app.getVersion());
  ipcMain.handle('get-api-port', () => apiPort);
  ipcMain.handle('get-platform', () => process.platform);
  ipcMain.handle('get-update-status', () => autoUpdater.getStatus());
  ipcMain.handle('get-backend-status', () => backendStatus);
  ipcMain.handle('get-camoufox-status', () => camoufoxStatus);
  ipcMain.handle('install-update', () => {
    autoUpdater.install();
  });
  ipcMain.handle('retry-camoufox-download', async () => {
    await camoufoxManager.retryDownload();
    return camoufoxManager.getStatus();
  });
  ipcMain.on('minimize-to-tray', () => {
    mainWindow?.hide();
  });

  debugLog('bootstrap:api-starting');
  await apiProcess.start();
  debugLog('bootstrap:api-running');

  mainWindow = await createMainWindow();
  debugLog('bootstrap:window-created');
  trayController = new TrayController({
    getWindow: () => mainWindow,
    getAutopilotStatus: () => `${autopilotStatus} | ${backendStatus.status}`,
    canStopAutopilot: () => hasActiveAutopilot,
    onStopAutopilot: async () => {
      await stopActiveAutopilot(apiProcess.apiBaseUrl);
      autopilotStatus = 'Stopping';
      hasActiveAutopilot = true;
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
  debugLog('bootstrap:tray-created');
  refreshDesktopStatus();

  void camoufoxManager.ensureBinaryReady().catch((error) => {
    console.error('Camoufox setup failed:', error);
  });

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
    backendStatusBroadcastUnsubscribe?.();
    clearAutopilotPolling();
    autoUpdater.dispose();
    await apiProcess.stop();
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });
}

void bootstrap();
