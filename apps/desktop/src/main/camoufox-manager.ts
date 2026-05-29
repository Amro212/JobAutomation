import { once } from 'node:events';
import {
  chmodSync,
  createWriteStream,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import type Store from 'electron-store';

import {
  CamoufoxFetcher,
  INSTALL_DIR,
  OS_NAME,
  unzip
} from 'camoufox-js/dist/pkgman.js';

import type { DesktopConfig } from './config-store.js';

type CamoufoxPlatform = typeof OS_NAME;

const LAUNCH_FILE: Record<CamoufoxPlatform, string> = {
  win: 'camoufox.exe',
  mac: path.join('Camoufox.app', 'Contents', 'MacOS', 'camoufox'),
  lin: 'camoufox-bin'
};

export type CamoufoxDownloadStatus =
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

type DownloadProgress = {
  progress: number | null;
  downloadedBytes: number;
  totalBytes: number | null;
};

type CamoufoxRelease = {
  version: string;
  release: string;
  url: string;
};

export class CamoufoxManager {
  private readonly store: Store<DesktopConfig>;
  private readonly onStatusChange: ((status: CamoufoxDownloadStatus) => void) | undefined;
  private ensurePromise: Promise<string | null> | null = null;
  private status: CamoufoxDownloadStatus = {
    state: 'idle',
    message: 'Camoufox setup pending.'
  };

  constructor(
    store: Store<DesktopConfig>,
    options?: {
      onStatusChange?: (status: CamoufoxDownloadStatus) => void;
    }
  ) {
    this.store = store;
    this.onStatusChange = options?.onStatusChange;
  }

  getInstallDir(): string {
    return INSTALL_DIR.toString();
  }

  getBinaryPath(): string | null {
    return this.store.get('camoufoxBinaryPath');
  }

  getStatus(): CamoufoxDownloadStatus {
    return this.status;
  }

  async ensureBinaryReady(options?: { forceDownload?: boolean }): Promise<string | null> {
    if (this.ensurePromise) {
      return this.ensurePromise;
    }

    this.ensurePromise = this.doEnsureBinaryReady(options).finally(() => {
      this.ensurePromise = null;
    });
    return this.ensurePromise;
  }

  async retryDownload(): Promise<string | null> {
    return this.ensureBinaryReady({ forceDownload: true });
  }

  private async doEnsureBinaryReady(options?: {
    forceDownload?: boolean;
  }): Promise<string | null> {
    const forceDownload = options?.forceDownload ?? false;
    this.setStatus({
      state: 'checking',
      message: 'Checking local Camoufox installation...'
    });

    if (!forceDownload) {
      const configuredBinary = this.resolveExistingBinary(this.getBinaryPath());
      if (configuredBinary) {
        this.setStatus({
          state: 'ready',
          message: 'Camoufox is ready.',
          binaryPath: configuredBinary
        });
        return configuredBinary;
      }

      const installBinary = this.resolveExistingBinary(this.resolveLaunchPath());
      if (installBinary) {
        this.store.set('camoufoxBinaryPath', installBinary);
        this.setStatus({
          state: 'ready',
          message: 'Camoufox is ready.',
          binaryPath: installBinary
        });
        return installBinary;
      }
    }

    try {
      const release = await this.fetchRelease();
      const installDir = this.getInstallDir();
      const tempDir = mkdtempSync(path.join(tmpdir(), 'jobautomation-camoufox-'));
      const archivePath = path.join(tempDir, 'camoufox.zip');

      try {
        rmSync(installDir, { recursive: true, force: true });
        mkdirSync(installDir, { recursive: true });

        await this.downloadArchive(release.url, archivePath, (progress) => {
          this.setStatus({
            state: 'downloading',
            message: 'Downloading Camoufox for first launch...',
            ...progress
          });
        });

        this.setStatus({
          state: 'extracting',
          message: 'Extracting Camoufox...'
        });
        await unzip(readFileSync(archivePath), installDir, 'Extracting Camoufox...', false);
        writeFileSync(
          path.join(installDir, 'version.json'),
          JSON.stringify(
            {
              version: release.version,
              release: release.release
            },
            null,
            2
          ),
          'utf8'
        );

        const binaryPath = this.resolveLaunchPath();
        if (!existsSync(binaryPath)) {
          throw new Error('Camoufox binary was not found after extraction.');
        }

        if (process.platform !== 'win32') {
          chmodSync(binaryPath, 0o755);
        }

        this.store.set('camoufoxBinaryPath', binaryPath);
        this.setStatus({
          state: 'ready',
          message: 'Camoufox is ready.',
          binaryPath
        });
        return binaryPath;
      } catch (error) {
        rmSync(installDir, { recursive: true, force: true });
        this.store.set('camoufoxBinaryPath', null);
        throw error;
      } finally {
        rmSync(tempDir, { recursive: true, force: true });
      }
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Camoufox download failed for an unknown reason.';
      this.setStatus({
        state: 'error',
        message
      });
      return null;
    }
  }

  private resolveExistingBinary(binaryPath: string | null): string | null {
    if (!binaryPath) {
      return null;
    }

    if (!existsSync(binaryPath)) {
      this.store.set('camoufoxBinaryPath', null);
      return null;
    }

    return binaryPath;
  }

  private resolveLaunchPath(): string {
    return path.join(this.getInstallDir(), LAUNCH_FILE[OS_NAME]);
  }

  private async fetchRelease(): Promise<CamoufoxRelease> {
    const fetcher = new CamoufoxFetcher();
    await fetcher.fetchLatest();
    return {
      version: fetcher.version,
      release: fetcher.release,
      url: fetcher.url
    };
  }

  private async downloadArchive(
    url: string,
    destination: string,
    onProgress: (progress: DownloadProgress) => void
  ): Promise<void> {
    const response = await fetch(url);
    if (!response.ok || !response.body) {
      throw new Error(`Unable to download Camoufox from ${url}.`);
    }

    const totalBytesHeader = response.headers.get('content-length');
    const totalBytes =
      totalBytesHeader && Number.parseInt(totalBytesHeader, 10) > 0
        ? Number.parseInt(totalBytesHeader, 10)
        : null;
    const fileStream = createWriteStream(destination);
    let downloadedBytes = 0;
    const reader = response.body.getReader();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }

        const chunk = value;
        downloadedBytes += chunk.length;
        if (!fileStream.write(chunk)) {
          await once(fileStream, 'drain');
        }

        onProgress({
          progress: totalBytes ? downloadedBytes / totalBytes : null,
          downloadedBytes,
          totalBytes
        });
      }

      fileStream.end();
      await once(fileStream, 'finish');
    } finally {
      reader.releaseLock();
      fileStream.destroy();
    }
  }

  private setStatus(status: CamoufoxDownloadStatus): void {
    this.status = status;
    this.onStatusChange?.(status);
  }
}
