import { describe, expect, test, vi } from 'vitest';

import { bindAutopilotWorkerMessageHandler } from '../../../apps/api/src/workers/autopilot-worker';
import type { QueueAutopilotRunInput } from '../../../apps/api/src/services/autopilot-queue';

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

describe('bindAutopilotWorkerMessageHandler', () => {
  test('rejects a second start-autopilot message while a run is active', async () => {
    let resolveRunNow: (() => void) | undefined;
    const runNow = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveRunNow = resolve;
        })
    );
    const postedEvents: unknown[] = [];
    const handleMessage = bindAutopilotWorkerMessageHandler({
      queue: {
        runNow,
        cancelRun: vi.fn(async () => true)
      },
      autopilotRuns: {
        findById: vi.fn(async () => ({ status: 'completed' }))
      },
      postMessage: (event) => {
        postedEvents.push(event);
      }
    });

    handleMessage({
      type: 'start-autopilot',
      payload: createQueueInput('run-1')
    });
    handleMessage({
      type: 'start-autopilot',
      payload: createQueueInput('run-2')
    });

    expect(runNow).toHaveBeenCalledTimes(1);
    expect(postedEvents).toEqual([
      {
        type: 'error',
        payload: {
          runId: 'run-2',
          message: 'Autopilot worker is already processing a run.'
        }
      }
    ]);

    resolveRunNow?.();
    await vi.waitFor(() => {
      expect(postedEvents).toHaveLength(2);
    });

    expect(postedEvents[1]).toMatchObject({
      type: 'completed',
      payload: { runId: 'run-1', status: 'completed' }
    });

    handleMessage({
      type: 'start-autopilot',
      payload: createQueueInput('run-3')
    });

    expect(runNow).toHaveBeenCalledTimes(2);
  });
});
