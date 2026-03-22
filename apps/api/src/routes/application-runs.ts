import { dirname, join } from 'node:path';

import {
  applicationRunRecordSchema,
  artifactRecordSchema,
  jobRecordSchema,
  logEventRecordSchema,
  type ApplicationRunStatus
} from '@jobautomation/core';
import { greenhouseApplicationSite, runApplication } from '@jobautomation/automation';
import type { FastifyPluginAsync } from 'fastify';

type CreateApplicationRunPayload = {
  jobId: string;
};

function parseCreatePayload(body: unknown): CreateApplicationRunPayload {
  const jobId =
    typeof body === 'object' && body !== null && typeof (body as { jobId?: unknown }).jobId === 'string'
      ? (body as { jobId: string }).jobId
      : null;

  if (!jobId || jobId.length === 0) {
    throw new Error('jobId must be a non-empty string.');
  }

  return { jobId };
}

function statusMessageForRun(status: ApplicationRunStatus): string {
  switch (status) {
    case 'paused':
      return 'Paused at final review and waiting for a human to submit.';
    case 'skipped':
      return 'Automation skipped before browser work started.';
    case 'running':
      return 'Automation is currently running.';
    case 'completed':
      return 'Automation completed.';
    case 'failed':
      return 'Automation failed before completion.';
    default:
      return 'Run is queued for automation.';
  }
}

export const registerApplicationRunRoutes: FastifyPluginAsync = async (app) => {
  app.get('/application-runs', async () => {
    const runs = await app.repositories.applicationRuns.list();

    const summaries = await Promise.all(
      runs.map(async (run) => {
        const job = await app.repositories.jobs.findById(run.jobId);
        if (!job) {
          return null;
        }

        return {
          run: applicationRunRecordSchema.parse(run),
          job: jobRecordSchema.parse(job)
        };
      })
    );

    return {
      runs: summaries.filter((value): value is NonNullable<typeof value> => value !== null)
    };
  });

  app.get('/application-runs/:runId', async (request, reply) => {
    const { runId } = request.params as { runId: string };
    const run = await app.repositories.applicationRuns.findById(runId);

    if (!run) {
      return reply.code(404).send({ message: 'Application run not found.' });
    }

    const job = await app.repositories.jobs.findById(run.jobId);

    if (!job) {
      return reply.code(404).send({ message: 'Application run job not found.' });
    }

    const [logs, artifacts] = await Promise.all([
      app.repositories.logEvents.listByApplicationRun(runId),
      app.repositories.artifacts.listByApplicationRun(runId)
    ]);

    return {
      run: applicationRunRecordSchema.parse(run),
      job: jobRecordSchema.parse(job),
      logs: logs.map((entry) => logEventRecordSchema.parse(entry)),
      artifacts: artifacts.map((artifact) => artifactRecordSchema.parse(artifact)),
      statusMessage: statusMessageForRun(run.status)
    };
  });

  app.post('/application-runs', async (request, reply) => {
    const payload = parseCreatePayload(request.body);
    const job = await app.repositories.jobs.findById(payload.jobId);

    if (!job) {
      return reply.code(404).send({ message: 'Job not found.' });
    }

    const run = await runApplication({
      jobId: payload.jobId,
      jobsRepository: app.repositories.jobs,
      applicantProfileRepository: app.repositories.applicantProfile,
      applicationRunsRepository: app.repositories.applicationRuns,
      artifactsRepository: app.repositories.artifacts,
      logEventsRepository: app.repositories.logEvents,
      siteFlows: [greenhouseApplicationSite],
      artifactsRootDir: join(dirname(app.config.JOB_AUTOMATION_DB_PATH), 'artifacts')
    });

    return {
      run: applicationRunRecordSchema.parse(run),
      job: jobRecordSchema.parse(job)
    };
  });
};
