export {};

type DesktopBackendStatus =
  | { status: 'stopped' }
  | { status: 'starting' }
  | { status: 'running' }
  | { status: 'stopping' }
  | { status: 'restarting'; attempt: number; delayMs: number }
  | { status: 'error'; message: string };

declare global {
  interface Window {
    electronAPI?: {
      getAppVersion: () => Promise<string>;
      getAutoUpdateStatus: () => Promise<unknown>;
      installUpdate: () => Promise<void>;
      getApiPort: () => Promise<number>;
      getPlatform: () => Promise<string>;
      getBackendStatus: () => Promise<DesktopBackendStatus>;
      minimizeToTray: () => void;
      onUpdateAvailable: (callback: (payload: unknown) => void) => () => void;
      onUpdateDownloaded: (callback: (payload: unknown) => void) => () => void;
      onUpdateError: (callback: (payload: unknown) => void) => () => void;
      onUpdateStatus: (callback: (payload: unknown) => void) => () => void;
      onBackendStatus: (callback: (payload: DesktopBackendStatus) => void) => () => void;
      onCamoufoxProgress: (callback: (payload: unknown) => void) => () => void;
    };
  }
}
