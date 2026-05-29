import { contextBridge, ipcRenderer } from 'electron';

const validReceiveChannels = new Set([
  'update-available',
  'update-downloaded',
  'update-error',
  'update-status',
  'backend-status',
  'camoufox-download-progress'
]);

function onChannel<T>(channel: string, callback: (payload: T) => void): () => void {
  if (!validReceiveChannels.has(channel)) {
    throw new Error(`Unsupported IPC channel: ${channel}`);
  }

  const handler = (_event: Electron.IpcRendererEvent, payload: T) => callback(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

contextBridge.exposeInMainWorld('electronAPI', {
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  getAutoUpdateStatus: () => ipcRenderer.invoke('get-update-status'),
  installUpdate: () => ipcRenderer.invoke('install-update'),
  getApiPort: () => ipcRenderer.invoke('get-api-port'),
  getPlatform: () => ipcRenderer.invoke('get-platform'),
  getBackendStatus: () => ipcRenderer.invoke('get-backend-status'),
  getCamoufoxStatus: () => ipcRenderer.invoke('get-camoufox-status'),
  retryCamoufoxDownload: () => ipcRenderer.invoke('retry-camoufox-download'),
  minimizeToTray: () => ipcRenderer.send('minimize-to-tray'),
  onUpdateAvailable: (callback: (payload: unknown) => void) =>
    onChannel('update-available', callback),
  onUpdateDownloaded: (callback: (payload: unknown) => void) =>
    onChannel('update-downloaded', callback),
  onUpdateError: (callback: (payload: unknown) => void) =>
    onChannel('update-error', callback),
  onUpdateStatus: (callback: (payload: unknown) => void) =>
    onChannel('update-status', callback),
  onBackendStatus: (callback: (payload: unknown) => void) =>
    onChannel('backend-status', callback),
  onCamoufoxProgress: (callback: (payload: unknown) => void) =>
    onChannel('camoufox-download-progress', callback)
});
