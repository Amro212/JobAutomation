import {
  applicationRunRecordSchema,
  autopilotRunRecordSchema,
  discoveryRunRecordSchema,
  jobRecordSchema
} from '@jobautomation/core';
import type { FastifyPluginAsync } from 'fastify';

function tailoringReady(profile: {
  baseResumeTex: string;
  reusableContext: string;
} | null): boolean {
  return Boolean(profile?.baseResumeTex.trim() && profile.reusableContext.trim());
}

export const registerAutopilotRunRoutes: FastifyPluginAsync = async (app) => {
  app.get('/autopilot-runs', async () => {
    const runs = await app.repositories.autopilotRuns.list();
    const summaries = await Promise.all(
      runs.map(async (run) => ({
        run: autopilotRunRecordSchema.parse(run),
        discoveryRun: run.discoveryRunId
          ? await app.repositories.discoveryRuns.findById(run.discoveryRunId)
          : null
      }))
    );

    return {
      runs: summaries.map((entry) => ({
        run: entry.run,
        discoveryRun: entry.discoveryRun
          ? discoveryRunRecordSchema.parse(entry.discoveryRun)
          : null
      }))
    };
  });

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
    const applications = await Promise.all(
      childRuns.map(async (childRun) => {
        const job = await app.repositories.jobs.findById(childRun.jobId);
        if (!job) {
          return null;
        }

        return {
          run: applicationRunRecordSchema.parse(childRun),
          job: jobRecordSchema.parse(job)
        };
      })
    );

    return {
      run: autopilotRunRecordSchema.parse(run),
      discoveryRun: discoveryRun ? discoveryRunRecordSchema.parse(discoveryRun) : null,
      applications: applications.filter(
        (value): value is NonNullable<typeof value> => value !== null
      )
    };
  });

  app.post('/autopilot-runs', async (_request, reply) => {
    const profile = await app.repositories.applicantProfile.get();
    if (!tailoringReady(profile)) {
      return reply.code(409).send({
        message:
          'Save the canonical LaTeX resume and reusable applicant context before launching autopilot.'
      });
    }

    const sources = await app.repositories.discoverySources.listEnabled();
    if (sources.length === 0) {
      return reply.code(409).send({
        message: 'Enable at least one discovery source before launching autopilot.'
      });
    }

    const run = await app.repositories.autopilotRuns.create({
      triggerKind: 'manual',
      status: 'pending',
      currentStep: 'queued'
    });

    app.autopilotQueue.enqueueRun({
      run,
      sources
    });

    return {
      run: autopilotRunRecordSchema.parse(run)
    };
  });

  app.post('/autopilot-runs/:runId/cancel', async (request, reply) => {
    const { runId } = request.params as { runId: string };
    const existing = await app.repositories.autopilotRuns.findById(runId);
    if (!existing) {
      return reply.code(404).send({ message: 'Autopilot run not found.' });
    }

    if (existing.status !== 'pending' && existing.status !== 'running') {
      return reply.code(409).send({ message: 'Run is not active.' });
    }

    const cancelled = await app.autopilotQueue.cancelRun(runId);
    if (!cancelled) {
      // Run exists but no active controller — update DB directly
      await app.repositories.autopilotRuns.update(runId, {
        status: 'cancelled',
        currentStep: 'cancelled',
        completedAt: new Date()
      });
    }

    const updated = await app.repositories.autopilotRuns.findById(runId);
    return { run: autopilotRunRecordSchema.parse(updated!) };
  });
};
