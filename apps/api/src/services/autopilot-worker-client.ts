import { execFile } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { Worker, type MessagePort } from 'node:worker_threads';

import type { AppEnv } from '@jobautomation/config';

import type { ApiRepositories } from '../plugins/db';
import type { QueueAutopilotRunInput } from './autopilot-queue';

const execFileAsync = promisify(execFile);

export type AutopilotWorkerCommand =
  | {
      type: 'start-autopilot';
      payload: QueueAutopilotRunInput;
    }
  | {
      type: 'cancel-autopilot';
      payload: { runId: string };
    };

export type AutopilotWorkerEvent =
  | { type: 'ready' }
  | {
      type: 'completed';
      payload: {
        runId: string;
        status: string;
      };
    }
  | {
      type: 'error';
      payload: {
        runId: string;
        message: string;
      };
    };

export type WorkerLike = Pick<
  Worker,
  'on' | 'once' | 'postMessage' | 'terminate' | 'removeAllListeners'
>;

function resolveWorkerEntry(): URL {
  const explicitWorkerEntry = process.env.JOB_AUTOMATION_AUTOPILOT_WORKER_ENTRY;
  if (explicitWorkerEntry) {
    return explicitWorkerEntry.startsWith('file:')
      ? new URL(explicitWorkerEntry)
      : pathToFileURL(path.resolve(explicitWorkerEntry));
  }

  const extension = import.meta.url.endsWith('.ts') ? 'ts' : 'js';
  return new URL(`../workers/autopilot-worker.${extension}`, import.meta.url);
}

async function terminateCamoufoxProcessesDefault(): Promise<void> {
  try {
    if (process.platform === 'win32') {
      await execFileAsync('taskkill', ['/F', '/T', '/IM', 'camoufox.exe']);
      return;
    }

    await execFileAsync('pkill', ['-f', 'camoufox']);
  } catch {
    // Best-effort process cleanup only.
  }
}

export class AutopilotWorkerThreadClient {
  private worker: WorkerLike | null = null;
  private startingPromise: Promise<void> | null = null;
  private activeRun:
    | {
        runId: string;
        resolve: () => void;
        reject: (error: Error) => void;
      }
    | null = null;
  private disposed = false;

  constructor(
    private readonly input: {
      config: AppEnv;
      repositories: ApiRepositories;
      logger?: {
        error: (error: unknown) => void;
      };
      workerFactory?: (entry: URL, workerData: { config: AppEnv }) => WorkerLike;
      terminateCamoufoxImpl?: () => Promise<void>;
    }
  ) {}

  async executeRun(input: QueueAutopilotRunInput): Promise<void> {
    if (this.activeRun) {
      throw new Error('Autopilot worker is already processing a run.');
    }

    await this.ensureStarted();

    await new Promise<void>((resolve, reject) => {
      this.activeRun = {
        runId: input.run.id,
        resolve,
        reject
      };

      this.worker?.postMessage({
        type: 'start-autopilot',
        payload: input
      } satisfies AutopilotWorkerCommand);
    });
  }

  async cancelRun(runId: string): Promise<boolean> {
    if (!this.activeRun || this.activeRun.runId !== runId) {
      return false;
    }

    await this.ensureStarted();
    this.worker?.postMessage({
      type: 'cancel-autopilot',
      payload: { runId }
    } satisfies AutopilotWorkerCommand);
    return true;
  }

  async dispose(): Promise<void> {
    this.disposed = true;
    const worker = this.worker;
    this.worker = null;
    this.startingPromise = null;
    this.activeRun = null;

    if (!worker) {
      return;
    }

    worker.removeAllListeners();
    await worker.terminate();
  }

  private async ensureStarted(): Promise<void> {
    if (this.worker) {
      return;
    }

    if (!this.startingPromise) {
      this.startingPromise = this.startWorker();
    }

    await this.startingPromise;
  }

  private async startWorker(): Promise<void> {
    const worker = this.input.workerFactory
      ? this.input.workerFactory(resolveWorkerEntry(), { config: this.input.config })
      : new Worker(resolveWorkerEntry(), {
          workerData: {
            config: this.input.config
          }
        });

    this.worker = worker;

    await new Promise<void>((resolve, reject) => {
      const readyListener = (message: AutopilotWorkerEvent) => {
        if (message.type !== 'ready') {
          return;
        }

        resolve();
      };

      worker.on('message', readyListener as Parameters<WorkerLike['on']>[1]);
      worker.once('error', reject);
    });

    worker.on('message', (message: AutopilotWorkerEvent) => {
      this.handleMessage(message);
    });
    worker.on('error', (error) => {
      this.input.logger?.error(error);
    });
    worker.on('exit', (code) => {
      void this.handleUnexpectedExit(code);
    });
  }

  private handleMessage(message: AutopilotWorkerEvent): void {
    if (message.type === 'completed') {
      if (this.activeRun?.runId === message.payload.runId) {
        this.activeRun.resolve();
        this.activeRun = null;
      }
      return;
    }

    if (message.type === 'error') {
      if (this.activeRun?.runId === message.payload.runId) {
        this.activeRun.reject(new Error(message.payload.message));
        this.activeRun = null;
      }
    }
  }

  private async handleUnexpectedExit(code: number): Promise<void> {
    const crashedRunId = this.activeRun?.runId ?? null;
    const activeRun = this.activeRun;

    this.worker = null;
    this.startingPromise = null;
    this.activeRun = null;

    if (this.disposed) {
      return;
    }

    if (activeRun) {
      activeRun.reject(
        new Error(`Autopilot worker exited unexpectedly with code ${code}.`)
      );

      await this.input.repositories.autopilotRuns.update(crashedRunId!, {
        status: 'failed',
        currentStep: 'failed',
        errorMessage: `Autopilot worker exited unexpectedly with code ${code}.`,
        completedAt: new Date()
      }).catch(() => null);

      await (this.input.terminateCamoufoxImpl ?? terminateCamoufoxProcessesDefault)()
        .catch(() => null);
    }

    try {
      await this.ensureStarted();
    } catch (error) {
      this.input.logger?.error(error);
    }
  }
}
