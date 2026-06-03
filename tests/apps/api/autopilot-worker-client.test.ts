import { EventEmitter } from 'node:events';
import { mkdirSync, rmSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { describe, expect, test, vi } from 'vitest';

import { readEnv } from '../../../packages/config/src/env';
import type { ApiRepositories } from '../../../apps/api/src/plugins/db';
import {
  AutopilotWorkerThreadClient,
  type WorkerLike
} from '../../../apps/api/src/services/autopilot-worker-client';
import type { QueueAutopilotRunInput } from '../../../apps/api/src/services/autopilot-queue';

class FakeWorker extends EventEmitter {
  readonly postedMessages: unknown[] = [];
  terminated = false;

  postMessage(message: unknown): void {
    this.postedMessages.push(message);
  }

  async terminate(): Promise<number> {
    this.terminated = true;
    return 0;
  }

  removeAllListeners(): this {
    super.removeAllListeners();
    return this;
  }
}

function createRepositoriesStub(): ApiRepositories {
  return {
    applicationRuns: {} as ApiRepositories['applicationRuns'],
    applicantProfile: {} as ApiRepositories['applicantProfile'],
    autopilotSettings: {} as ApiRepositories['autopilotSettings'],
    autopilotRuns: {
      update: vi.fn(async () => null)
    } as unknown as ApiRepositories['autopilotRuns'],
    artifacts: {} as ApiRepositories['artifacts'],
    discoveryRuns: {} as ApiRepositories['discoveryRuns'],
    discoverySchedules: {} as ApiRepositories['discoverySchedules'],
    discoverySources: {} as ApiRepositories['discoverySources'],
    jobs: {} as ApiRepositories['jobs'],
    logEvents: {} as ApiRepositories['logEvents']
  };
}

function createQueueInput(runId: string): QueueAutopilotRunInput {
  return {
    run: { id: runId } as QueueAutopilotRunInput['run'],
    sources: [],
    config: {
      discoverySourceIds: [],
      applySiteKeys: ['greenhouse'],
      maxJobsPerRun: null,
      matchProfile: null,
      forceFreshDiscovery: false,
      discoveryCacheHours: 3,
      artifactMode: 'resume',
      jobFilters: {}
    }
  };
}

async function waitForPostedMessage(
  worker: FakeWorker,
  index: number
): Promise<unknown> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const message = worker.postedMessages[index];
    if (message !== undefined) {
      return message;
    }

    await Promise.resolve();
  }

  throw new Error(`Timed out waiting for posted message at index ${index}.`);
}

describe('AutopilotWorkerThreadClient', () => {
  test('starts the TypeScript worker entry in dev mode', async () => {
    const dbPath = fileURLToPath(
      new URL(`../../../data/test/${randomUUID()}.sqlite`, import.meta.url)
    );
    mkdirSync(dirname(dbPath), { recursive: true });

    const client = new AutopilotWorkerThreadClient({
      config: readEnv({
        JOB_AUTOMATION_DB_PATH: dbPath,
        API_HOST: '127.0.0.1',
        API_PORT: '1',
        API_BASE_URL: 'http://127.0.0.1:1'
      } as NodeJS.ProcessEnv),
      repositories: createRepositoriesStub(),
      workerStartupTimeoutMs: 15000
    });

    try {
      await expect(client.executeRun(createQueueInput('missing-run'))).resolves.toBeUndefined();
    } finally {
      await client.dispose();
      rmSync(dbPath, { force: true });
    }
  }, 20000);

  test('starts the worker, posts run commands, and forwards cancel requests', async () => {
    const fakeWorker = new FakeWorker();
    const client = new AutopilotWorkerThreadClient({
      config: readEnv({} as NodeJS.ProcessEnv),
      repositories: createRepositoriesStub(),
      workerFactory: (_entry, _workerData) => fakeWorker as unknown as WorkerLike
    });

    const executePromise = client.executeRun(createQueueInput('run-1'));
    await Promise.resolve();
    fakeWorker.emit('message', { type: 'ready' });

    expect(await waitForPostedMessage(fakeWorker, 0)).toMatchObject({
      type: 'start-autopilot',
      payload: {
        run: {
          id: 'run-1'
        }
      }
    });

    await expect(client.cancelRun('run-1')).resolves.toBe(true);
    expect(fakeWorker.postedMessages[1]).toMatchObject({
      type: 'cancel-autopilot',
      payload: { runId: 'run-1' }
    });

    fakeWorker.emit('message', {
      type: 'completed',
      payload: { runId: 'run-1', status: 'completed' }
    });

    await executePromise;
    await client.dispose();

    expect(fakeWorker.terminated).toBe(true);
  });

  test('removes the ready listener after the worker signals ready', async () => {
    const fakeWorker = new FakeWorker();
    const client = new AutopilotWorkerThreadClient({
      config: readEnv({} as NodeJS.ProcessEnv),
      repositories: createRepositoriesStub(),
      workerFactory: (_entry, _workerData) => fakeWorker as unknown as WorkerLike
    });

    const executePromise = client.executeRun(createQueueInput('run-1'));
    await Promise.resolve();
    fakeWorker.emit('message', { type: 'ready' });

    await waitForPostedMessage(fakeWorker, 0);
    expect(fakeWorker.listenerCount('message')).toBe(1);

    fakeWorker.emit('message', {
      type: 'completed',
      payload: { runId: 'run-1', status: 'completed' }
    });

    await executePromise;
    await client.dispose();
  });

  test('rejects when the worker exits before reporting ready', async () => {
    const fakeWorker = new FakeWorker();
    const client = new AutopilotWorkerThreadClient({
      config: readEnv({} as NodeJS.ProcessEnv),
      repositories: createRepositoriesStub(),
      workerFactory: (_entry, _workerData) => fakeWorker as unknown as WorkerLike,
      workerStartupTimeoutMs: 100
    });

    const executePromise = client.executeRun(createQueueInput('run-1'));
    await Promise.resolve();
    fakeWorker.emit('exit', 1);

    await expect(executePromise).rejects.toThrow(
      'Autopilot worker exited before ready with code 1.'
    );
  });

  test('rejects when the worker never reports ready', async () => {
    const fakeWorker = new FakeWorker();
    const client = new AutopilotWorkerThreadClient({
      config: readEnv({} as NodeJS.ProcessEnv),
      repositories: createRepositoriesStub(),
      workerFactory: (_entry, _workerData) => fakeWorker as unknown as WorkerLike,
      workerStartupTimeoutMs: 1
    });

    await expect(client.executeRun(createQueueInput('run-1'))).rejects.toThrow(
      'Autopilot worker did not report ready in time.'
    );
  });
});
