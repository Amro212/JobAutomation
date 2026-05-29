import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';

import type Store from 'electron-store';
import { app } from 'electron';

import type { DesktopConfig } from './config-store.js';

export class CamoufoxManager {
  private readonly store: Store<DesktopConfig>;

  constructor(store: Store<DesktopConfig>) {
    this.store = store;
  }

  getInstallDir(): string {
    return path.join(app.getPath('userData'), 'camoufox');
  }

  getBinaryPath(): string | null {
    return this.store.get('camoufoxBinaryPath');
  }

  async ensureBinaryReady(): Promise<string | null> {
    mkdirSync(this.getInstallDir(), { recursive: true });
    const binaryPath = this.getBinaryPath();
    if (!binaryPath) {
      return null;
    }

    if (existsSync(binaryPath)) {
      return binaryPath;
    }

    this.store.set('camoufoxBinaryPath', null);
    return null;
  }
}
