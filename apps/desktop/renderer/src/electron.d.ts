export {};

type DesktopBackendStatus =
  | { status: 'stopped' }
  | { status: 'starting' }
  | { status: 'running' }
  | { status: 'stopping' }
  | { status: 'restarting'; attempt: number; delayMs: number }
  | { status: 'error'; message: string };

type CamoufoxDownloadStatus =
  | { state: 'idle'; message: string }
  | { state: 'checking'; message: string }
  | {
      state: 'downloading';
      message: string;
      progress: number | null;
      downloadedBytes: number;
      totalBytes: number | null;
    }
  | { state: 'extracting'; message: string }
  | { state: 'ready'; message: string; binaryPath: string }
  | { state: 'error'; message: string };

declare global {
  interface Window {
    electronAPI?: {
      getAppVersion: () => Promise<string>;
      getAutoUpdateStatus: () => Promise<unknown>;
      installUpdate: () => Promise<void>;
      getApiPort: () => Promise<number>;
      getPlatform: () => Promise<string>;
      getBackendStatus: () => Promise<DesktopBackendStatus>;
      getCamoufoxStatus: () => Promise<CamoufoxDownloadStatus>;
      retryCamoufoxDownload: () => Promise<CamoufoxDownloadStatus>;
      minimizeToTray: () => void;
      onUpdateAvailable: (callback: (payload: unknown) => void) => () => void;
      onUpdateDownloaded: (callback: (payload: unknown) => void) => () => void;
      onUpdateError: (callback: (payload: unknown) => void) => () => void;
      onUpdateStatus: (callback: (payload: unknown) => void) => () => void;
      onBackendStatus: (callback: (payload: DesktopBackendStatus) => void) => () => void;
      onCamoufoxProgress: (callback: (payload: CamoufoxDownloadStatus) => void) => () => void;
    };
  }
}
