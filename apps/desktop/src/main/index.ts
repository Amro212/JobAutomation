import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  app,
  BrowserWindow,
  ipcMain,
  Notification,
  dialog,
  shell,
  type BrowserWindowConstructorOptions
} from 'electron';
import type Store from 'electron-store';

/* ── Main-process crash handlers (Electron best practice) ──── */

process.on('uncaughtException', (error) => {
  console.error('[main:uncaughtException]', error);
  try {
    dialog.showErrorBox(
      'Unexpected Error',
      `An unexpected error occurred in the application.\n\n${error.message}\n\nThe application will attempt to continue running.`
    );
  } catch {
    // dialog may not be available if the error fires before app is ready
  }
});

process.on('unhandledRejection', (reason) => {
  const message =
    reason instanceof Error ? reason.message : String(reason);
  console.error('[main:unhandledRejection]', message);
});


import { DesktopAutoUpdater } from './auto-updater.js';
import { resolveAppIconPath } from './app-icon.js';
import { ApiProcessManager } from './api-process.js';
import {
  CamoufoxManager,
  type CamoufoxDownloadStatus
} from './camoufox-manager.js';
import {
  configureDesktopUserDataPath,
  createDesktopConfigStore,
  findAvailableApiPort,
  type DesktopConfig
} from './config-store.js';

configureDesktopUserDataPath();
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
// currentDir = dist/main/main — navigate up to the desktop package root
const desktopRoot = path.resolve(currentDir, '..', '..', '..');
// The workspace root (two more levels up from apps/desktop)
const workspaceRoot = path.resolve(desktopRoot, '..', '..');

function getWindowOptions(store: { get: <K extends keyof DesktopConfig>(key: K) => DesktopConfig[K] }): BrowserWindowConstructorOptions {
  const bounds = store.get('windowBounds');

  return {
    width: bounds?.width ?? 1440,
    height: bounds?.height ?? 900,
    ...(bounds ? { x: bounds.x, y: bounds.y } : {}),
    minWidth: 1100,
    minHeight: 700,
    show: false,
    frame: false,
    backgroundColor: '#0b1020',
    icon: resolveAppIconPath(),
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

  // currentDir is dist/main/main — go up 3 levels to the desktop root,
  // then into dist/renderer. (app.getAppPath() returns the entry-point dir
  // in dev, not the package root, so we cannot use it here.)
  const desktopRoot = path.resolve(currentDir, '..', '..', '..');
  return `file://${path.join(desktopRoot, 'dist', 'renderer', 'index.html')}`;
}

async function createMainWindow(): Promise<BrowserWindow> {
  const window = new BrowserWindow(getWindowOptions(configStore));
  const entry = getRendererEntry();

  window.removeMenu();

  window.once('ready-to-show', () => {
    window.show();
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http:') || url.startsWith('https:')) {
      void shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  await window.loadURL(entry);

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
  configStore = createDesktopConfigStore({ workspaceRoot });
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
    desktopRoot,
    workspaceRoot,
    packaged: app.isPackaged,
    aiGatewayBaseUrl: configStore.get('aiGatewayBaseUrl'),
    aiAuthToken: configStore.get('aiAuthToken'),
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
  ipcMain.handle('get-ai-session', () => ({
    signedIn: Boolean(configStore.get('aiAuthToken')),
    gatewayBaseUrl: configStore.get('aiGatewayBaseUrl')
  }));
  ipcMain.handle('set-ai-session', async (_event, session: { gatewayBaseUrl?: string; authToken?: string }) => {
    const gatewayBaseUrl = typeof session.gatewayBaseUrl === 'string' ? session.gatewayBaseUrl.trim() : '';
    const authToken = typeof session.authToken === 'string' ? session.authToken.trim() : '';
    if (!gatewayBaseUrl || !authToken) {
      throw new Error('AI session requires gatewayBaseUrl and authToken.');
    }
    configStore.set('aiGatewayBaseUrl', gatewayBaseUrl);
    configStore.set('aiAuthToken', authToken);
    apiProcess.updateAiSession({ aiGatewayBaseUrl: gatewayBaseUrl, aiAuthToken: authToken });
    await apiProcess.stop();
    await apiProcess.start();
    return { signedIn: true, gatewayBaseUrl };
  });
  ipcMain.handle('clear-ai-session', async () => {
    configStore.set('aiAuthToken', null);
    apiProcess.updateAiSession({
      aiGatewayBaseUrl: configStore.get('aiGatewayBaseUrl'),
      aiAuthToken: null
    });
    await apiProcess.stop();
    await apiProcess.start();
    return { signedIn: false, gatewayBaseUrl: configStore.get('aiGatewayBaseUrl') };
  });
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
  ipcMain.on('window-minimize', () => {
    mainWindow?.minimize();
  });
  ipcMain.on('window-maximize', () => {
    if (mainWindow?.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow?.maximize();
    }
  });
  ipcMain.on('window-close', () => {
    mainWindow?.close();
  });

  // Create window and tray FIRST so the user always sees the app,
  // even while the backend is still starting up.
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

  // Start the API in the background so the window appears immediately.
  debugLog('bootstrap:api-starting');
  apiProcess.start().then(() => {
    debugLog('bootstrap:api-running');
  }).catch((error) => {
    console.error('API process failed to start:', error);
  });

  void camoufoxManager.ensureBinaryReady().catch((error) => {
    console.error('Camoufox setup failed:', error);
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

bootstrap().catch((error) => {
  console.error('Bootstrap failed:', error);
});
