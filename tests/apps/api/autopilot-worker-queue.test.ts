import { describe, expect, test, vi } from 'vitest';

import { autopilotConfigSchema } from '../../../packages/core/src/autopilot-config';
import type { ApiRepositories } from '../../../apps/api/src/plugins/db';
import {
  WorkerAutopilotQueueService,
  type AutopilotWorkerClient,
  type QueueAutopilotRunInput
} from '../../../apps/api/src/services/autopilot-queue';

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
    config: autopilotConfigSchema.parse({
      discoverySourceIds: [],
      applySiteKeys: ['greenhouse'],
      matchProfile: null,
      forceFreshDiscovery: false,
      discoveryCacheHours: 6,
      maxJobsPerRun: null,
      artifactMode: 'resume',
      jobFilters: {}
    })
  };
}

describe('WorkerAutopilotQueueService', () => {
  test('sends active runs to the worker client and forwards cancellation', async () => {
    let releaseActiveRun: () => void = () => {
      throw new Error('Run release handler was not initialized.');
    };
    const workerClient: AutopilotWorkerClient = {
      executeRun: vi.fn(
        () =>
          new Promise<void>((resolve) => {
            releaseActiveRun = () => {
              resolve();
            };
          })
      ),
      cancelRun: vi.fn(async () => true)
    };
    const queue = new WorkerAutopilotQueueService({
      repositories: createRepositoriesStub(),
      workerClient
    });

    queue.enqueueRun(createQueueInput('run-1'));
    await Promise.resolve();

    expect(workerClient.executeRun).toHaveBeenCalledWith(
      expect.objectContaining({
        run: expect.objectContaining({ id: 'run-1' })
      })
    );

    expect(queue.requestCancelRun('run-1')).toBe(true);
    expect(workerClient.cancelRun).toHaveBeenCalledWith('run-1');

    releaseActiveRun();
    await queue.onIdle();
  });

  test('drops pending runs that are cancelled before execution starts', async () => {
    let releaseActiveRun: () => void = () => {
      throw new Error('Run release handler was not initialized.');
    };
    const workerClient: AutopilotWorkerClient = {
      executeRun: vi
        .fn()
        .mockImplementationOnce(
          () =>
            new Promise<void>((resolve) => {
              releaseActiveRun = () => {
                resolve();
              };
            })
        )
        .mockResolvedValueOnce(undefined),
      cancelRun: vi.fn(async () => false)
    };
    const repositories = createRepositoriesStub();
    const updateRunSpy = vi.spyOn(repositories.autopilotRuns, 'update');
    const queue = new WorkerAutopilotQueueService({
      repositories,
      workerClient
    });

    queue.enqueueRun(createQueueInput('run-1'));
    queue.enqueueRun(createQueueInput('run-2'));
    await Promise.resolve();

    expect(queue.requestCancelRun('run-2')).toBe(true);
    expect(updateRunSpy).toHaveBeenCalledWith(
      'run-2',
      expect.objectContaining({
        status: 'cancelled',
        currentStep: 'cancelled'
      })
    );

    releaseActiveRun();
    await queue.onIdle();

    expect(workerClient.executeRun).toHaveBeenCalledTimes(1);
    expect(workerClient.executeRun).toHaveBeenCalledWith(
      expect.objectContaining({
        run: expect.objectContaining({ id: 'run-1' })
      })
    );
  });

  test('marks a queued run failed when the worker client rejects before persisting state', async () => {
    const workerClient: AutopilotWorkerClient = {
      executeRun: vi.fn(async () => {
        throw new Error('Worker failed before startup.');
      }),
      cancelRun: vi.fn(async () => false)
    };
    const repositories = createRepositoriesStub();
    const updateRunSpy = vi.spyOn(repositories.autopilotRuns, 'update');
    const queue = new WorkerAutopilotQueueService({
      repositories,
      workerClient
    });

    queue.enqueueRun(createQueueInput('run-1'));
    await queue.onIdle();

    expect(updateRunSpy).toHaveBeenCalledWith(
      'run-1',
      expect.objectContaining({
        status: 'failed',
        currentStep: 'failed',
        errorMessage: 'Worker failed before startup.'
      })
    );
  });
});
