export {};

declare global {
  interface Window {
    electronAPI?: {
      getAppVersion: () => Promise<string>;
      getAutoUpdateStatus: () => Promise<unknown>;
      installUpdate: () => Promise<void>;
      getApiPort: () => Promise<number>;
      getPlatform: () => Promise<string>;
      minimizeToTray: () => void;
      onUpdateAvailable: (callback: (payload: unknown) => void) => () => void;
      onUpdateDownloaded: (callback: (payload: unknown) => void) => () => void;
      onCamoufoxProgress: (callback: (payload: unknown) => void) => () => void;
    };
  }
}
