import {
  artifactRecordSchema,
  discoveryRunRecordSchema,
  discoveryRunSourceSummarySchema,
  logEventRecordSchema
} from '@jobautomation/core';
import { retryDiscoveryStep } from '@jobautomation/discovery';
import type { FastifyPluginAsync } from 'fastify';

function parseCreateDiscoveryRunPayload(body: unknown): { sourceIds: string[] } {
  const sourceIds =
    typeof body === 'object' && body !== null && Array.isArray((body as { sourceIds?: unknown }).sourceIds)
      ? (body as { sourceIds: unknown[] }).sourceIds
      : null;

  if (!sourceIds || sourceIds.length === 0 || sourceIds.some((value) => typeof value !== 'string' || value.length === 0)) {
    throw new Error('sourceIds must be a non-empty array of strings.');
  }

  return {
    sourceIds
  };
}

function parseRetryPayload(body: unknown): { sourceId: string } {
  const sourceId =
    typeof body === 'object' && body !== null && typeof (body as { sourceId?: unknown }).sourceId === 'string'
      ? (body as { sourceId: string }).sourceId
      : null;

  if (!sourceId || sourceId.length === 0) {
    throw new Error('sourceId must be a non-empty string.');
  }

  return { sourceId };
}

type DiscoveryRunSourceSummaryDetails = {
  discoverySourceId?: string;
  sourceKind?: string;
  sourceKey?: string;
  label?: string;
  jobCount?: number;
  newJobCount?: number;
  updatedJobCount?: number;
  errorMessage?: string;
};

function parseDetailsJson(detailsJson: string | null): DiscoveryRunSourceSummaryDetails | null {
  if (!detailsJson) {
    return null;
  }

  try {
    const parsed = JSON.parse(detailsJson) as DiscoveryRunSourceSummaryDetails;
    return typeof parsed === 'object' && parsed !== null ? parsed : null;
  } catch {
    return null;
  }
}

function buildSourceSummaries(logs: Array<{ message: string; detailsJson: string | null }>) {
  return logs.flatMap((log) => {
    const details = parseDetailsJson(log.detailsJson);
    if (
      !details?.sourceKind ||
      !details.sourceKey ||
      !details.label ||
      (!log.message.startsWith('Completed ') &&
        !log.message.startsWith('Failed ') &&
        !log.message.startsWith('Skipped '))
    ) {
      return [];
    }

    const status = log.message.startsWith('Completed ')
      ? 'completed'
      : log.message.startsWith('Failed ')
        ? 'failed'
        : 'skipped';

    return [
      discoveryRunSourceSummarySchema.parse({
        discoverySourceId: details.discoverySourceId ?? null,
        sourceKind: details.sourceKind,
        sourceKey: details.sourceKey,
        label: details.label,
        status,
        jobCount: details.jobCount ?? 0,
        newJobCount: details.newJobCount ?? 0,
        updatedJobCount: details.updatedJobCount ?? 0,
        errorMessage: details.errorMessage ?? null
      })
    ];
  });
}

export const registerDiscoveryRunRoutes: FastifyPluginAsync = async (app) => {
  app.get('/discovery-runs', async () => {
    const runs = await app.repositories.discoveryRuns.list();
    return {
      runs: runs.map((run) => discoveryRunRecordSchema.parse(run))
    };
  });

  app.get('/discovery-runs/:runId', async (request, reply) => {
    const { runId } = request.params as { runId: string };
    const run = await app.repositories.discoveryRuns.findById(runId);

    if (!run) {
      return reply.code(404).send({ message: 'Discovery run not found.' });
    }

    const logs = await app.repositories.logEvents.listByDiscoveryRun(runId);
    const artifacts = await app.repositories.artifacts.listByDiscoveryRun(runId);
    return {
      run: discoveryRunRecordSchema.parse(run),
      logs: logs.map((entry) => logEventRecordSchema.parse(entry)),
      artifacts: artifacts.map((artifact) => artifactRecordSchema.parse(artifact)),
      sourceSummaries: buildSourceSummaries(logs)
    };
  });

  app.post('/discovery-runs', async (request, reply) => {
    const payload = parseCreateDiscoveryRunPayload(request.body);
    const sources = await app.repositories.discoverySources.listByIds(payload.sourceIds);

    if (sources.length !== payload.sourceIds.length) {
      return reply.code(404).send({ message: 'One or more discovery sources were not found.' });
    }

    const run = await app.repositories.discoveryRuns.create({
      sourceKind: sources.length === 1 ? sources[0]!.sourceKind : 'structured',
      runKind: sources.length === 1 ? 'single-source' : 'structured',
      triggerKind: 'manual',
      discoverySourceId: sources.length === 1 ? sources[0]!.id : null,
      status: 'pending'
    });

    await app.repositories.logEvents.create({
      discoveryRunId: run.id,
      level: 'info',
      message: 'Queued manual discovery run.',
      detailsJson: JSON.stringify({
        sourceIds: sources.map((source) => source.id)
      })
    });

    app.discoveryQueue.enqueueRun({
      run,
      sources
    });

    return {
      runs: [discoveryRunRecordSchema.parse(run)]
    };
  });

  app.post('/discovery-runs/:runId/retry', async (request, reply) => {
    const { runId } = request.params as { runId: string };
    const payload = parseRetryPayload(request.body);
    const source = await app.repositories.discoverySources.findById(payload.sourceId);

    if (!source) {
      return reply.code(404).send({ message: 'Discovery source not found.' });
    }

    const requestedFromRun = await app.repositories.discoveryRuns.findById(runId);
    if (!requestedFromRun) {
      return reply.code(404).send({ message: 'Discovery run not found.' });
    }

    const retryRun = await retryDiscoveryStep({
      source,
      runsRepository: app.repositories.discoveryRuns,
      logEventsRepository: app.repositories.logEvents,
      requestedFromRun
    });

    app.discoveryQueue.enqueueRun({
      run: retryRun,
      sources: [source]
    });

    return {
      run: discoveryRunRecordSchema.parse(retryRun)
    };
  });
};
