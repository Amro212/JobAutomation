import { useEffect, useState } from 'react';

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

const browserModeStatus: CamoufoxDownloadStatus = {
  state: 'ready',
  message: 'Camoufox status unavailable in browser mode.',
  binaryPath: 'browser-mode'
};

export function useCamoufoxStatus() {
  const [status, setStatus] = useState<CamoufoxDownloadStatus>({
    state: 'idle',
    message: 'Checking Camoufox setup...'
  });

  useEffect(() => {
    const api = window.electronAPI;
    if (!api) {
      setStatus(browserModeStatus);
      return;
    }

    void api.getCamoufoxStatus().then((nextStatus) => {
      setStatus(nextStatus);
    });

    return api.onCamoufoxProgress((nextStatus) => {
      setStatus(nextStatus);
    });
  }, []);

  const retry = async () => {
    const api = window.electronAPI;
    if (!api) {
      return browserModeStatus;
    }

    const nextStatus = await api.retryCamoufoxDownload();
    setStatus(nextStatus);
    return nextStatus;
  };

  return {
    status,
    retry
  };
}
