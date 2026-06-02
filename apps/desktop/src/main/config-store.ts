import path from 'node:path';
import net from 'node:net';

import Store from 'electron-store';
import { app, type Rectangle } from 'electron';

export type DesktopConfig = {
  apiHost: string;
  apiPort: number;
  dbPath: string;
  headedMode: boolean;
  camoufoxBinaryPath: string | null;
  aiGatewayBaseUrl: string | null;
  aiAuthToken: string | null;
  windowBounds: Rectangle | null;
};

const DEFAULT_API_HOST = '127.0.0.1';
const DEFAULT_API_PORT = 3001;

export function createDesktopConfigStore(): Store<DesktopConfig> {
  return new Store<DesktopConfig>({
    name: 'config',
    cwd: app.getPath('userData'),
    defaults: {
      apiHost: DEFAULT_API_HOST,
      apiPort: DEFAULT_API_PORT,
      dbPath: path.join(app.getPath('userData'), 'jobautomation.sqlite'),
      headedMode: false,
      camoufoxBinaryPath: null,
      aiGatewayBaseUrl: null,
      aiAuthToken: null,
      windowBounds: null
    }
  });
}

async function isPortAvailable(host: string, port: number): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => {
      server.close((error) => {
        resolve(!error);
      });
    });
    server.listen(port, host);
  });
}

export async function findAvailableApiPort(
  host: string,
  preferredPort: number,
  maxOffset = 9
): Promise<number> {
  for (let offset = 0; offset <= maxOffset; offset += 1) {
    const candidate = preferredPort + offset;
    // eslint-disable-next-line no-await-in-loop
    if (await isPortAvailable(host, candidate)) {
      return candidate;
    }
  }

  throw new Error(`No available API port found in range ${preferredPort}-${preferredPort + maxOffset}.`);
}
