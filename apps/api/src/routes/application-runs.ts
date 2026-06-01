import { dirname, join } from 'node:path';

import {
  applicationRunRecordSchema,
  artifactRecordSchema,
  jobRecordSchema,
  logEventRecordSchema,
  type ApplicationRunStatus,
} from '@jobautomation/core';
import {
  ashbyApplicationSite,
  greenhouseApplicationSite,
  leverApplicationSite,
  runApplication,
} from '@jobautomation/automation';
import type { FastifyPluginAsync } from 'fastify';

type CreateApplicationRunPayload = {
  jobId: string;
};

type ApplicationRunsQuery = {
  page?: string;
  pageSize?: string;
  status?: string;
};

function parseCreatePayload(body: unknown): CreateApplicationRunPayload {
  const jobId =
    typeof body === 'object' &&
      body !== null &&
      typeof (body as { jobId?: unknown }).jobId === 'string'
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
      return 'Automation is paused and waiting for a human review step.';
    case 'skipped':
      return 'Automation skipped before browser work started.';
    case 'running':
      return 'Automation is currently running.';
    case 'retry':
      return 'Automation timed out and is queued for retry on the next autopilot pass.';
    case 'completed':
      return 'Automation completed.';
    case 'failed':
      return 'Automation failed before completion.';
    default:
      return 'Run is queued for automation.';
  }
}

function hasGeneratedResumePdfArtifact(
  artifacts: Array<{ kind: string; format: string }>
): boolean {
  return artifacts.some(
    (artifact) => artifact.format === 'pdf' && artifact.kind === 'resume-variant'
  );
}

async function resolveSubmittedArtifacts(
  app: Parameters<typeof registerApplicationRunRoutes>[0],
  run: { resumeArtifactId: string | null; coverLetterArtifactId: string | null }
) {
  const [resumeArtifact, coverLetterArtifact] = await Promise.all([
    run.resumeArtifactId
      ? app.repositories.artifacts.findById(run.resumeArtifactId)
      : Promise.resolve(null),
    run.coverLetterArtifactId
      ? app.repositories.artifacts.findById(run.coverLetterArtifactId)
      : Promise.resolve(null)
  ]);

  return {
    resumeArtifact: resumeArtifact
      ? artifactRecordSchema.parse(resumeArtifact)
      : null,
    coverLetterArtifact: coverLetterArtifact
      ? artifactRecordSchema.parse(coverLetterArtifact)
      : null
  };
}

export const registerApplicationRunRoutes: FastifyPluginAsync = async (app) => {
  app.get('/application-runs', async (request) => {
    const query = (request.query ?? {}) as ApplicationRunsQuery;
    const pageRaw = Number.parseInt(query.page ?? '1', 10);
    const pageSizeRaw = Number.parseInt(query.pageSize ?? '1000', 10);
    const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1;
    const pageSize = Number.isFinite(pageSizeRaw)
      ? Math.min(Math.max(pageSizeRaw, 1), 100)
      : 25;
    const statusFilters =
      typeof query.status === 'string' && query.status.length > 0
        ? query.status
          .split(',')
          .map((status) => status.trim())
          .filter((status): status is ApplicationRunStatus => status.length > 0)
        : undefined;

    const { runs, total } = await app.repositories.applicationRuns.listPaginated(
      { page, pageSize },
      { statuses: statusFilters }
    );

    // Batch-fetch all related jobs in a single query instead of N individual findById calls
    const uniqueJobIds = [...new Set(runs.map((run) => run.jobId))];
    const jobsMap = await app.repositories.jobs.findByIds(uniqueJobIds);

    // Batch-fetch all referenced artifacts in a single query
    const artifactIds = runs.flatMap((run) =>
      [run.resumeArtifactId, run.coverLetterArtifactId].filter(
        (id): id is string => id != null
      )
    );
    const artifactsMap =
      artifactIds.length > 0
        ? await app.repositories.artifacts.findByIds([...new Set(artifactIds)])
        : new Map();

    const summaries = runs
      .map((run) => {
        const job = jobsMap.get(run.jobId);
        if (!job) {
          return null;
        }

        const resumeArtifact = run.resumeArtifactId
          ? artifactsMap.get(run.resumeArtifactId) ?? null
          : null;
        const coverLetterArtifact = run.coverLetterArtifactId
          ? artifactsMap.get(run.coverLetterArtifactId) ?? null
          : null;

        return {
          run: applicationRunRecordSchema.parse(run),
          job: jobRecordSchema.parse(job),
          resumeArtifact: resumeArtifact
            ? artifactRecordSchema.parse(resumeArtifact)
            : null,
          coverLetterArtifact: coverLetterArtifact
            ? artifactRecordSchema.parse(coverLetterArtifact)
            : null
        };
      })
      .filter(
        (value): value is NonNullable<typeof value> => value !== null
      );

    return {
      runs: summaries,
      total,
      page,
      pageSize
    };
  });

  app.get('/application-runs/stats', async () => {
    return await app.repositories.applicationRuns.getStats();
  });

  app.get('/application-runs/:runId', async (request, reply) => {
    const { runId } = request.params as { runId: string };
    const run = await app.repositories.applicationRuns.findById(runId);

    if (!run) {
      return reply.code(404).send({ message: 'Application run not found.' });
    }

    const job = await app.repositories.jobs.findById(run.jobId);

    if (!job) {
      return reply
        .code(404)
        .send({ message: 'Application run job not found.' });
    }

    const [logs, artifacts] = await Promise.all([
      app.repositories.logEvents.listByApplicationRun(runId),
      app.repositories.artifacts.listByApplicationRun(runId),
    ]);
    const submittedArtifacts = await resolveSubmittedArtifacts(app, run);

    return {
      run: applicationRunRecordSchema.parse(run),
      job: jobRecordSchema.parse(job),
      logs: logs.map((entry) => logEventRecordSchema.parse(entry)),
      artifacts: artifacts.map((artifact) =>
        artifactRecordSchema.parse(artifact)
      ),
      ...submittedArtifacts,
      statusMessage: statusMessageForRun(run.status),
    };
  });

  app.post('/application-runs', async (request, reply) => {
    const payload = parseCreatePayload(request.body);
    const job = await app.repositories.jobs.findById(payload.jobId);

    if (!job) {
      return reply.code(404).send({ message: 'Job not found.' });
    }

    const artifacts = await app.repositories.artifacts.listByJob(job.id);
    if (!hasGeneratedResumePdfArtifact(artifacts)) {
      return reply
        .code(409)
        .send({
          message:
            'Generate tailored artifacts before starting an application run.',
        });
    }

    const applicationFillPlanModel =
      app.config.OPENROUTER_APPLICATION_FILL_PLAN_MODEL ??
      app.config.OPENROUTER_JOB_SUMMARY_MODEL;

    if (app.config.OPENROUTER_API_KEY && !applicationFillPlanModel) {
      throw new Error(
        'OPENROUTER_APPLICATION_FILL_PLAN_MODEL or OPENROUTER_JOB_SUMMARY_MODEL must be set when OpenRouter is configured.'
      );
    }

    const run = await runApplication({
      jobId: payload.jobId,
      jobsRepository: app.repositories.jobs,
      applicantProfileRepository: app.repositories.applicantProfile,
      applicationRunsRepository: app.repositories.applicationRuns,
      artifactsRepository: app.repositories.artifacts,
      logEventsRepository: app.repositories.logEvents,
      siteFlows: [
        greenhouseApplicationSite,
        leverApplicationSite,
        ashbyApplicationSite,
      ],
      openRouter: app.config.OPENROUTER_API_KEY
        ? {
          apiKey: app.config.OPENROUTER_API_KEY,
          baseUrl: app.config.OPENROUTER_API_BASE_URL,
          model: applicationFillPlanModel!,
          reasoning: {
            enabled: true,
            exclude: true,
          },
        }
        : null,
      artifactsRootDir: join(
        dirname(app.config.JOB_AUTOMATION_DB_PATH),
        'artifacts'
      ),
    });

    return {
      run: applicationRunRecordSchema.parse(run),
      job: jobRecordSchema.parse(job),
    };
  });
};
