import { contextBridge, ipcRenderer } from 'electron';

const validReceiveChannels = new Set(['update-available', 'update-downloaded', 'camoufox-download-progress']);

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
  minimizeToTray: () => ipcRenderer.send('minimize-to-tray'),
  onUpdateAvailable: (callback: (payload: unknown) => void) =>
    onChannel('update-available', callback),
  onUpdateDownloaded: (callback: (payload: unknown) => void) =>
    onChannel('update-downloaded', callback),
  onCamoufoxProgress: (callback: (payload: unknown) => void) =>
    onChannel('camoufox-download-progress', callback)
});
