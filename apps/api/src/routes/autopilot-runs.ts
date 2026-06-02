import {
  autopilotConfigInputSchema,
  autopilotConfigSchema,
  applicationRunRecordSchema,
  autopilotRunRecordSchema,
  discoveryRunRecordSchema,
  type AutopilotConfig,
  type AutopilotConfigInput
} from '@jobautomation/core';
import type { FastifyPluginAsync } from 'fastify';

function tailoringReady(profile: {
  baseResumeTex: string;
  reusableContext: string;
} | null): boolean {
  return Boolean(profile?.baseResumeTex.trim() && profile.reusableContext.trim());
}

function resolveAutopilotConfig(
  defaults: AutopilotConfig,
  overrideInput: AutopilotConfigInput
): AutopilotConfig {
  const mergedJobFilters = overrideInput.jobFilters
    ? {
        ...defaults.jobFilters,
        ...overrideInput.jobFilters
      }
    : defaults.jobFilters;

  return autopilotConfigSchema.parse({
    ...defaults,
    ...overrideInput,
    jobFilters: mergedJobFilters
  });
}

export const registerAutopilotRunRoutes: FastifyPluginAsync = async (app) => {
  app.get('/autopilot-runs', async () => {
    const runs = await app.repositories.autopilotRuns.list();

    // Batch-fetch all referenced discovery runs instead of N individual findById calls
    const discoveryRunIds = runs
      .map((run) => run.discoveryRunId)
      .filter((id): id is string => id != null);
    const discoveryRunsMap = await app.repositories.discoveryRuns.findByIds(
      [...new Set(discoveryRunIds)]
    );

    return {
      runs: runs.map((run) => ({
        run: autopilotRunRecordSchema.parse(run),
        discoveryRun: run.discoveryRunId
          ? discoveryRunsMap.get(run.discoveryRunId)
            ? discoveryRunRecordSchema.parse(discoveryRunsMap.get(run.discoveryRunId)!)
            : null
          : null
      }))
    };
  });

  app.get('/autopilot-runs/queue/status', async () => ({
    queue: app.autopilotQueue.getStatus()
  }));

  app.get('/autopilot-runs/:runId', async (request, reply) => {
    const { runId } = request.params as { runId: string };
    const run = await app.repositories.autopilotRuns.findById(runId);
    if (!run) {
      return reply.code(404).send({ message: 'Autopilot run not found.' });
    }

    const discoveryRun = run.discoveryRunId
      ? await app.repositories.discoveryRuns.findById(run.discoveryRunId)
      : null;
    const childRuns = await app.repositories.applicationRuns.listByAutopilotRun(run.id);

    // Batch-fetch only the fields the UI needs (title, companyName, location)
    // instead of full JobRecord objects with descriptionText, rawPayload, etc.
    // This keeps the response payload small even when there are many child runs.
    const uniqueJobIds = [...new Set(childRuns.map((r) => r.jobId))];
    const jobsMap = await app.repositories.jobs.findSummariesByIds(uniqueJobIds);

    const applications = childRuns
      .map((childRun) => {
        const job = jobsMap.get(childRun.jobId);
        if (!job) {
          return null;
        }

        return {
          run: applicationRunRecordSchema.parse(childRun),
          job
        };
      })
      .filter(
        (value): value is NonNullable<typeof value> => value !== null
      );

    return {
      run: autopilotRunRecordSchema.parse(run),
      // Return only the id from discoveryRun — the UI uses it solely to render
      // the "Open discovery run" button. The full record can contain megabyte-sized
      // error_message blobs from Zod validation dumps that bloat the response.
      discoveryRun: discoveryRun ? { id: discoveryRun.id } : null,
      applications
    };
  });

  app.post('/autopilot-runs', async (request, reply) => {
    const profile = await app.repositories.applicantProfile.get();
    if (!tailoringReady(profile)) {
      return reply.code(409).send({
        message:
          'Save the canonical LaTeX resume and reusable applicant context before launching autopilot.'
      });
    }

    const settings = await app.repositories.autopilotSettings.getOrCreateDefault();
    const config = resolveAutopilotConfig(
      settings.config,
      autopilotConfigInputSchema.parse(request.body ?? {})
    );

    const enabledSources = await app.repositories.discoverySources.listEnabled();
    if (enabledSources.length === 0) {
      return reply.code(409).send({
        message: 'Enable at least one discovery source before launching autopilot.'
      });
    }

    const selectedSources =
      config.discoverySourceIds.length === 0
        ? enabledSources
        : enabledSources.filter((source) => config.discoverySourceIds.includes(source.id));

    if (
      config.discoverySourceIds.length > 0 &&
      selectedSources.length !== config.discoverySourceIds.length
    ) {
      return reply.code(409).send({
        message:
          'One or more selected discovery sources are not enabled. Update your selections and try again.'
      });
    }

    if (selectedSources.length === 0) {
      return reply.code(409).send({
        message:
          'Select at least one enabled discovery source before launching autopilot.'
      });
    }

    const run = await app.repositories.autopilotRuns.create({
      triggerKind: 'manual',
      status: 'pending',
      currentStep: 'queued',
      config
    });

    app.autopilotQueue.enqueueRun({
      run,
      sources: selectedSources,
      config
    });

    return {
      run: autopilotRunRecordSchema.parse(run)
    };
  });

  app.post('/autopilot-runs/:runId/cancel', async (request, reply) => {
    const { runId } = request.params as { runId: string };

    const active = app.autopilotQueue.requestCancelRun(runId);
    if (!active) {
      void app.repositories.autopilotRuns.update(runId, {
        status: 'cancelled',
        currentStep: 'cancelled',
        completedAt: new Date()
      }).catch(() => null);
    }

    return { accepted: true, active };
  });
};
