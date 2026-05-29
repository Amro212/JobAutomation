import { fork, type ChildProcess } from 'node:child_process';
import path from 'node:path';

type ApiProcessMessage = {
  type?: string;
};

export type ApiProcessOptions = {
  apiHost: string;
  apiPort: number;
  dbPath: string;
  desktopRoot: string;
  packaged: boolean;
  onExit?: (code: number | null, signal: NodeJS.Signals | null) => void;
};

function resolveApiEntry(options: Pick<ApiProcessOptions, 'desktopRoot' | 'packaged'>): string {
  if (options.packaged) {
    return path.join(process.resourcesPath, 'api', 'index.js');
  }

  return path.resolve(options.desktopRoot, '../api/src/index.ts');
}

async function waitForHealth(apiBaseUrl: string, timeoutMs = 15000): Promise<void> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(`${apiBaseUrl}/health`, {
        headers: {
          accept: 'application/json'
        }
      });

      if (response.ok) {
        return;
      }
    } catch {
      // wait for the next poll
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(`API health check timed out after ${timeoutMs}ms.`);
}

export class ApiProcessManager {
  private child: ChildProcess | null = null;
  private stopping = false;
  private readonly options: ApiProcessOptions;

  constructor(options: ApiProcessOptions) {
    this.options = options;
  }

  get apiBaseUrl(): string {
    return `http://${this.options.apiHost}:${this.options.apiPort}`;
  }

  async start(): Promise<void> {
    if (this.child) {
      return;
    }

    this.stopping = false;
    const entry = resolveApiEntry(this.options);
    const child = fork(entry, {
      cwd: this.options.desktopRoot,
      env: {
        ...process.env,
        API_HOST: this.options.apiHost,
        API_PORT: String(this.options.apiPort),
        API_BASE_URL: this.apiBaseUrl,
        JOB_AUTOMATION_DB_PATH: this.options.dbPath
      },
      execArgv: this.options.packaged ? [] : ['--import', 'tsx'],
      stdio: ['pipe', 'pipe', 'pipe', 'ipc']
    });

    child.stdout?.on('data', (chunk) => process.stdout.write(chunk));
    child.stderr?.on('data', (chunk) => process.stderr.write(chunk));
    child.once('exit', (code, signal) => {
      this.child = null;
      this.options.onExit?.(code, signal);
    });

    this.child = child;

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error('API process did not report ready in time.'));
      }, 15000);

      const messageHandler = (message: ApiProcessMessage | string) => {
        const type =
          typeof message === 'string'
            ? message
            : typeof message === 'object' && message !== null
              ? message.type
              : undefined;

        if (type === 'ready') {
          cleanup();
          resolve();
        }
      };

      const exitHandler = (code: number | null) => {
        cleanup();
        reject(new Error(`API process exited before ready (code=${String(code)}).`));
      };

      const cleanup = () => {
        clearTimeout(timeout);
        child.off('message', messageHandler);
        child.off('exit', exitHandler);
      };

      child.on('message', messageHandler);
      child.on('exit', exitHandler);
    });

    await waitForHealth(this.apiBaseUrl);
  }

  async stop(): Promise<void> {
    if (!this.child) {
      return;
    }

    this.stopping = true;
    const child = this.child;

    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        child.kill('SIGKILL');
      }, 5000);

      child.once('exit', () => {
        clearTimeout(timeout);
        resolve();
      });

      child.send({ type: 'shutdown' });
    });
  }
}
