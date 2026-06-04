import {
  fork,
  type ChildProcess,
  type ForkOptions
} from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

type ApiProcessMessage = {
  type?: string;
};

type ChildProcessLike = Pick<
  ChildProcess,
  'send' | 'kill' | 'on' | 'once' | 'off' | 'stdout' | 'stderr'
>;

const MAX_CHILD_OUTPUT_CHARS = 4000;

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
  aiGatewayBaseUrl?: string | null;
  aiAuthToken?: string | null;
  maxRestartAttempts?: number;
  restartBaseDelayMs?: number;
  childFactory?: (entry: string, options: ForkOptions) => ChildProcessLike;
  healthCheck?: (apiBaseUrl: string) => Promise<void>;
};

function resolveApiEntry(options: Pick<ApiProcessOptions, 'desktopRoot' | 'packaged' | 'workspaceRoot'>): string {
  if (options.packaged) {
    return path.join(process.resourcesPath, 'api', 'index.cjs');
  }

  // In dev the API source lives at <workspaceRoot>/apps/api/src/index.ts.
  // If workspaceRoot is not provided, fall back to navigating from desktopRoot.
  const base = options.workspaceRoot ?? path.resolve(options.desktopRoot, '..', '..');
  return path.join(base, 'apps', 'api', 'src', 'index.ts');
}

function resolveApiCwd(options: Pick<ApiProcessOptions, 'desktopRoot' | 'packaged'>): string {
  return options.packaged ? path.dirname(process.execPath) : options.desktopRoot;
}

function parseDotEnvValue(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }

  return trimmed;
}

function readDevDotEnv(workspaceRoot?: string): NodeJS.ProcessEnv {
  if (!workspaceRoot) {
    return {};
  }

  const envPath = path.join(workspaceRoot, '.env');
  if (!existsSync(envPath)) {
    return {};
  }

  const output: NodeJS.ProcessEnv = {};
  const content = readFileSync(envPath, 'utf8');
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }

    const normalized = line.startsWith('export ') ? line.slice('export '.length).trim() : line;
    const separatorIndex = normalized.indexOf('=');
    if (separatorIndex <= 0) {
      continue;
    }

    const key = normalized.slice(0, separatorIndex).trim();
    const value = parseDotEnvValue(normalized.slice(separatorIndex + 1));
    if (!key || process.env[key] !== undefined) {
      continue;
    }

    output[key] = value;
  }

  return output;
}

function appendRecentOutput(current: string, next: string): string {
  const combined = `${current}${next}`;
  if (combined.length <= MAX_CHILD_OUTPUT_CHARS) {
    return combined;
  }

  return combined.slice(combined.length - MAX_CHILD_OUTPUT_CHARS);
}

function formatStartupError(message: string, childOutput: string): string {
  const output = childOutput.trim();
  if (!output) {
    return message;
  }

  return `${message}\n\nRecent API process output:\n${output}`;
}

function packagedNodePath(): string {
  return [
    path.join(process.resourcesPath, 'app.asar', 'node_modules'),
    path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules'),
    process.env.NODE_PATH
  ]
    .filter((entry): entry is string => Boolean(entry))
    .join(path.delimiter);
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
    const cwd = resolveApiCwd(this.options);
    console.error(`[api-process] Forking API from: ${entry}`);
    console.error(`[api-process] CWD: ${cwd}`);
    console.error(`[api-process] Packaged: ${String(this.options.packaged)}`);
    const devDotEnv = this.options.packaged ? {} : readDevDotEnv(this.options.workspaceRoot);
    const childFactory = this.options.childFactory ?? ((childEntry, childOptions) =>
      fork(childEntry, childOptions));
    const child = childFactory(entry, {
      cwd,
      env: {
        ...devDotEnv,
        ...process.env,
        API_HOST: this.options.apiHost,
        API_PORT: String(this.options.apiPort),
        API_BASE_URL: this.apiBaseUrl,
        JOB_AUTOMATION_DB_PATH: this.options.dbPath,
        JOB_AUTOMATION_TECTONIC_CACHE_DIR: path.join(
          path.dirname(this.options.dbPath),
          'tectonic'
        ),
        ...(this.options.aiGatewayBaseUrl
          ? {
              JOBAUTOMATION_AI_GATEWAY_BASE_URL: this.options.aiGatewayBaseUrl
            }
          : {}),
        ...(this.options.aiAuthToken
          ? {
              JOBAUTOMATION_AI_AUTH_TOKEN: this.options.aiAuthToken
            }
          : {}),
        ...(this.options.packaged
          ? {
              ELECTRON_RUN_AS_NODE: '1',
              NODE_PATH: packagedNodePath(),
              JOB_AUTOMATION_AUTOPILOT_WORKER_ENTRY: path.join(
                process.resourcesPath,
                'api',
                'workers',
                'autopilot-worker.cjs'
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
    let childOutput = '';

    child.stdout?.on('data', (chunk) => {
      const text = chunk.toString();
      childOutput = appendRecentOutput(childOutput, text);
      console.error(`[api-stdout] ${text.trimEnd()}`);
      process.stdout.write(chunk);
    });
    child.stderr?.on('data', (chunk) => {
      const text = chunk.toString();
      childOutput = appendRecentOutput(childOutput, text);
      console.error(`[api-stderr] ${text.trimEnd()}`);
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
          reject(new Error(formatStartupError('API process did not report ready in time.', childOutput)));
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
          reject(
            new Error(
              formatStartupError(
                `API process exited before ready (code=${String(code)}).`,
                childOutput
              )
            )
          );
        };

        const errorHandler = (error: Error) => {
          cleanup();
          reject(
            new Error(
              formatStartupError(`API process failed to start: ${error.message}`, childOutput)
            )
          );
        };

        const cleanup = () => {
          clearTimeout(timeout);
          child.off('message', messageHandler);
          child.off('exit', exitHandler);
          child.off('error', errorHandler);
        };

        cleanupIpc = cleanup;
        child.on('message', messageHandler);
        child.on('exit', exitHandler);
        child.on('error', errorHandler);
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

  updateAiSession(input: { aiGatewayBaseUrl?: string | null; aiAuthToken?: string | null }): void {
    this.options.aiGatewayBaseUrl = input.aiGatewayBaseUrl ?? null;
    this.options.aiAuthToken = input.aiAuthToken ?? null;
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
