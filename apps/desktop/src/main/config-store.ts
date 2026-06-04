import net from 'node:net';

import Store from 'electron-store';
import { app, type Rectangle } from 'electron';

import {
  resolveDefaultDbPath,
  resolveDesktopUserDataPath,
  shouldResetDevelopmentDbPath,
  shouldResetProductionDbPath
} from './config-paths.js';

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

export function configureDesktopUserDataPath(): void {
  app.setPath(
    'userData',
    resolveDesktopUserDataPath({
      appDataPath: app.getPath('appData'),
      packaged: app.isPackaged
    })
  );
}

function resetDbPath(
  store: Store<DesktopConfig>,
  input: { userDataPath: string; workspaceRoot: string }
): void {
  const dbPath = store.get('dbPath');
  const shouldReset =
    shouldResetProductionDbPath({
      packaged: app.isPackaged,
      userDataPath: input.userDataPath,
      dbPath
    }) ||
    shouldResetDevelopmentDbPath({
      packaged: app.isPackaged,
      userDataPath: input.userDataPath,
      dbPath
    });

  if (!shouldReset) {
    return;
  }

  store.set(
    'dbPath',
    resolveDefaultDbPath({
      packaged: app.isPackaged,
      userDataPath: input.userDataPath,
      workspaceRoot: input.workspaceRoot
    })
  );
}

export function createDesktopConfigStore(input: { workspaceRoot: string }): Store<DesktopConfig> {
  const userDataPath = app.getPath('userData');
  const store = new Store<DesktopConfig>({
    name: 'config',
    cwd: userDataPath,
    defaults: {
      apiHost: DEFAULT_API_HOST,
      apiPort: DEFAULT_API_PORT,
      dbPath: resolveDefaultDbPath({
        packaged: app.isPackaged,
        userDataPath,
        workspaceRoot: input.workspaceRoot
      }),
      headedMode: false,
      camoufoxBinaryPath: null,
      aiGatewayBaseUrl: null,
      aiAuthToken: null,
      windowBounds: null
    }
  });

  resetDbPath(store, { userDataPath, workspaceRoot: input.workspaceRoot });
  return store;
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
