import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { app, nativeImage } from 'electron';

const ICON_FILE = process.platform === 'win32' ? 'icon.ico' : 'icon.png';

export function resolveAppIconPath(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, ICON_FILE);
  }

  // Dev-mode: __dirname resolves to dist/main/main — walk up three levels
  // to reach the desktop package root (apps/desktop) where resources/ lives.
  return path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '..',
    '..',
    '..',
    'resources',
    ICON_FILE
  );
}

export function loadAppIcon(): Electron.NativeImage {
  const icon = nativeImage.createFromPath(resolveAppIconPath());
  return icon.isEmpty() ? nativeImage.createEmpty() : icon;
}
