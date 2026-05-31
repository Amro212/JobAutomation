import {
  fork,
  type ChildProcess,
  type ForkOptions
} from 'node:child_process';
import path from 'node:path';

type ApiProcessMessage = {
  type?: string;
};

type ChildProcessLike = Pick<
  ChildProcess,
  'send' | 'kill' | 'on' | 'once' | 'off' | 'stdout' | 'stderr'
>;

export type ApiProcessState =
  | { status: 'stopped' }
  | { status: 'starting' }
  | { status: 'running' }
  | { status: 'stopping' }
  | { status: 'restarting'; attempt: number; delayMs: number }
  | { status: 'error'; message: string };

export type ApiProcessOptions = {
  apiHost: string;
  apiPort: number;
  dbPath: string;
  desktopRoot: string;
  /** Monorepo workspace root (apps/desktop/../..) — used in dev to locate the API source. */
  workspaceRoot?: string;
  packaged: boolean;
  onExit?: (code: number | null, signal: NodeJS.Signals | null) => void;
  onStateChange?: (state: ApiProcessState) => void;
  maxRestartAttempts?: number;
  restartBaseDelayMs?: number;
  childFactory?: (entry: string, options: ForkOptions) => ChildProcessLike;
  healthCheck?: (apiBaseUrl: string) => Promise<void>;
};

function resolveApiEntry(options: Pick<ApiProcessOptions, 'desktopRoot' | 'packaged' | 'workspaceRoot'>): string {
  if (options.packaged) {
    return path.join(process.resourcesPath, 'api', 'index.js');
  }

  // In dev the API source lives at <workspaceRoot>/apps/api/src/index.ts.
  // If workspaceRoot is not provided, fall back to navigating from desktopRoot.
  const base = options.workspaceRoot ?? path.resolve(options.desktopRoot, '..', '..');
  return path.join(base, 'apps', 'api', 'src', 'index.ts');
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
  private child: ChildProcessLike | null = null;
  private stopping = false;
  private restartTimer: ReturnType<typeof setTimeout> | null = null;
  private restartAttempts = 0;
  private state: ApiProcessState = { status: 'stopped' };
  private readonly options: ApiProcessOptions;

  constructor(options: ApiProcessOptions) {
    this.options = options;
  }

  get apiBaseUrl(): string {
    return `http://${this.options.apiHost}:${this.options.apiPort}`;
  }

  getState(): ApiProcessState {
    return this.state;
  }

  async start(): Promise<void> {
    if (this.child) {
      return;
    }

    this.clearRestartTimer();
    this.stopping = false;
    this.setState({ status: 'starting' });
    const entry = resolveApiEntry(this.options);
    console.error(`[api-process] Forking API from: ${entry}`);
    console.error(`[api-process] CWD: ${this.options.desktopRoot}`);
    console.error(`[api-process] Packaged: ${String(this.options.packaged)}`);
    const childFactory = this.options.childFactory ?? ((childEntry, childOptions) =>
      fork(childEntry, childOptions));
    const child = childFactory(entry, {
      cwd: this.options.desktopRoot,
      env: {
        ...process.env,
        API_HOST: this.options.apiHost,
        API_PORT: String(this.options.apiPort),
        API_BASE_URL: this.apiBaseUrl,
        JOB_AUTOMATION_DB_PATH: this.options.dbPath,
        JOB_AUTOMATION_TECTONIC_CACHE_DIR: path.join(
          path.dirname(this.options.dbPath),
          'tectonic'
        ),
        ...(this.options.packaged
          ? {
              ELECTRON_RUN_AS_NODE: '1',
              JOB_AUTOMATION_AUTOPILOT_WORKER_ENTRY: path.join(
                process.resourcesPath,
                'api',
                'workers',
                'autopilot-worker.js'
              ),
              JOB_AUTOMATION_DB_MIGRATIONS_DIR: path.join(
                process.resourcesPath,
                'api',
                'drizzle'
              ),
              JOB_AUTOMATION_DOCUMENT_TEMPLATES_DIR: path.join(
                process.resourcesPath,
                'api',
                'templates'
              )
            }
          : {})
      },
      execPath: this.options.packaged ? process.execPath : 'node',
      execArgv: this.options.packaged ? [] : ['--import', 'tsx'],
      stdio: ['pipe', 'pipe', 'pipe', 'ipc']
    });

    child.stdout?.on('data', (chunk) => {
      console.error(`[api-stdout] ${chunk.toString().trimEnd()}`);
      process.stdout.write(chunk);
    });
    child.stderr?.on('data', (chunk) => {
      console.error(`[api-stderr] ${chunk.toString().trimEnd()}`);
      process.stderr.write(chunk);
    });
    child.on('error', (error) => {
      console.error(`[api-process] Fork error:`, error);
    });
    child.once('exit', (code, signal) => {
      console.error(`[api-process] Child exited: code=${String(code)}, signal=${String(signal)}`);
      this.child = null;
      this.options.onExit?.(code, signal);
      if (this.stopping) {
        this.setState({ status: 'stopped' });
        return;
      }

      void this.handleUnexpectedExit(code, signal);
    });

    this.child = child;

    try {
      let cleanupIpc: () => void = () => {};
      const ipcReadyPromise = new Promise<void>((resolve, reject) => {
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

        cleanupIpc = cleanup;
        child.on('message', messageHandler);
        child.on('exit', exitHandler);
      });

      const healthPromise = (this.options.healthCheck ?? waitForHealth)(this.apiBaseUrl);

      await Promise.race([ipcReadyPromise, healthPromise]);
      cleanupIpc();

      this.restartAttempts = 0;
      this.setState({ status: 'running' });
    } catch (error) {
      this.child = null;
      this.setState({
        status: 'error',
        message: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  async stop(): Promise<void> {
    this.clearRestartTimer();
    if (!this.child) {
      this.stopping = true;
      this.setState({ status: 'stopped' });
      return;
    }

    this.stopping = true;
    this.setState({ status: 'stopping' });
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

  private async handleUnexpectedExit(
    code: number | null,
    signal: NodeJS.Signals | null
  ): Promise<void> {
    if (this.stopping) {
      return;
    }

    const maxRestartAttempts = this.options.maxRestartAttempts ?? 3;
    if (this.restartAttempts >= maxRestartAttempts) {
      this.setState({
        status: 'error',
        message: `API process exited unexpectedly (code=${String(code)}, signal=${String(signal)}).`
      });
      return;
    }

    this.restartAttempts += 1;
    const delayMs = (this.options.restartBaseDelayMs ?? 1000) * 2 ** (this.restartAttempts - 1);
    this.setState({
      status: 'restarting',
      attempt: this.restartAttempts,
      delayMs
    });

    await new Promise<void>((resolve) => {
      this.restartTimer = setTimeout(() => {
        this.restartTimer = null;
        resolve();
      }, delayMs);
    });

    if (this.stopping || this.child) {
      return;
    }

    try {
      await this.start();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.setState({
        status: 'error',
        message
      });
    }
  }

  private clearRestartTimer(): void {
    if (!this.restartTimer) {
      return;
    }

    clearTimeout(this.restartTimer);
    this.restartTimer = null;
  }

  private setState(state: ApiProcessState): void {
    this.state = state;
    this.options.onStateChange?.(state);
  }
}
