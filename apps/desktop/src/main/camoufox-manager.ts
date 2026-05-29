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
    return this.getBinaryPath();
  }
}
