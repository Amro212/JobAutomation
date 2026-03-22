import { mkdir, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';

import { prefilterJob } from '@jobautomation/core';
import type {
  ApplicantProfile,
  ApplicationRunRecord,
  ApplicationRunStatus,
  ApplicationRunType,
  ArtifactRecord,
  JobRecord,
  PrefilterReason
} from '@jobautomation/core';
import type { Browser } from 'playwright';

import type {
  ApplicationArtifacts,
  ApplicationRunRecordLike,
  SupportedApplicationSite
} from './contracts';
import { buildApplicationFieldMapping } from './field-mapping';
import { createApplicationSession } from './session-manager';
import { stopBeforeSubmit } from './stop-before-submit';
import { createDiscoveryBrowser } from '../playwright/browser';

type JobsRepository = {
  findById: (id: string) => Promise<JobRecord | null>;
};

type ApplicantProfileRepository = {
  get: () => Promise<ApplicantProfile | null>;
};

type ApplicationRunsRepository = {
  create: (input: {
    jobId: string;
    siteKey: ApplicationRunType;
    status: ApplicationRunStatus;
    currentStep: string;
    stopReason?: string | null;
    prefilterReasons?: PrefilterReason[];
    reviewUrl?: string | null;
    resumeArtifactId?: string | null;
    coverLetterArtifactId?: string | null;
  }) => Promise<ApplicationRunRecord>;
  findById?: (id: string) => Promise<ApplicationRunRecord | null>;
  update: (
    id: string,
    patch: Partial<ApplicationRunRecord> & { prefilterReasons?: PrefilterReason[] }
  ) => Promise<ApplicationRunRecord | null>;
};

type ArtifactsRepository = {
  listByJobAndKind: (jobId: string, kind: string) => Promise<ArtifactRecord[]>;
  findById: (id: string) => Promise<ArtifactRecord | null>;
  create?: (input: {
    jobId: string | null;
    discoveryRunId?: string | null;
    applicationRunId?: string | null;
    kind: string;
    format: string;
    fileName: string;
    storagePath: string;
    createdAt: Date;
  }) => Promise<{ id: string; kind: string }>;
};

type LogEventsRepository = {
  create: (input: {
    discoveryRunId?: string | null;
    applicationRunId?: string | null;
    jobId?: string | null;
    level: 'info' | 'warn' | 'error';
    message: string;
    detailsJson?: string | null;
    createdAt?: Date;
  }) => Promise<unknown>;
};

export type RunApplicationInput = {
  jobId: string;
  runId?: string;
  jobsRepository: JobsRepository;
  applicantProfileRepository: ApplicantProfileRepository;
  applicationRunsRepository: ApplicationRunsRepository;
  artifactsRepository: ArtifactsRepository;
  logEventsRepository: LogEventsRepository;
  siteFlows: SupportedApplicationSite[];
  artifactsRootDir?: string;
  createBrowser?: () => Promise<Browser>;
  createSession?: typeof createApplicationSession;
};

function sanitizeSegment(value: string): string {
  return value.replace(/[^a-z0-9._-]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase();
}

function pickLatestPdfArtifact(artifacts: ArtifactRecord[]): ArtifactRecord | null {
  return artifacts
    .filter((artifact) => artifact.format === 'pdf')
    .sort((a, b) => {
      if (b.version !== a.version) {
        return b.version - a.version;
      }
      return b.createdAt.getTime() - a.createdAt.getTime();
    })[0] ?? null;
}

async function resolveArtifacts(input: {
  jobId: string;
  run: ApplicationRunRecordLike | null;
  artifactsRepository: ArtifactsRepository;
}): Promise<ApplicationArtifacts> {
  if (input.run?.resumeArtifactId || input.run?.coverLetterArtifactId) {
    return {
      resume: input.run.resumeArtifactId
        ? await input.artifactsRepository.findById(input.run.resumeArtifactId)
        : null,
      coverLetter: input.run.coverLetterArtifactId
        ? await input.artifactsRepository.findById(input.run.coverLetterArtifactId)
        : null
    };
  }

  const [resumeArtifacts, coverLetterArtifacts] = await Promise.all([
    input.artifactsRepository.listByJobAndKind(input.jobId, 'resume-variant'),
    input.artifactsRepository.listByJobAndKind(input.jobId, 'cover-letter')
  ]);

  return {
    resume: pickLatestPdfArtifact(resumeArtifacts),
    coverLetter: pickLatestPdfArtifact(coverLetterArtifacts)
  };
}

async function logRunEvent(
  repository: LogEventsRepository,
  input: {
    applicationRunId: string;
    jobId: string;
    level: 'info' | 'warn' | 'error';
    message: string;
    details?: Record<string, unknown>;
  }
): Promise<void> {
  await repository.create({
    applicationRunId: input.applicationRunId,
    jobId: input.jobId,
    level: input.level,
    message: input.message,
    detailsJson: input.details ? JSON.stringify(input.details) : null
  });
}

export async function runApplication(input: RunApplicationInput): Promise<ApplicationRunRecordLike> {
  const job = await input.jobsRepository.findById(input.jobId);
  if (!job) {
    throw new Error(`Job ${input.jobId} was not found.`);
  }

  const siteFlow = input.siteFlows.find((candidate) => candidate.supports(job));
  if (!siteFlow) {
    throw new Error(`No supported application flow matched job ${job.id}.`);
  }

  const applicantProfile = await input.applicantProfileRepository.get();
  const existingRun =
    input.runId && input.applicationRunsRepository.findById
      ? await input.applicationRunsRepository.findById(input.runId)
      : null;
  const run =
    existingRun ??
    (await input.applicationRunsRepository.create({
      jobId: job.id,
      siteKey: siteFlow.siteKey,
      status: 'pending',
      currentStep: 'queued',
      prefilterReasons: []
    }));

  const prefilter = prefilterJob(job, {
    jobKeywordProfile: applicantProfile?.jobKeywordProfile ?? null,
    preferredCountries: applicantProfile?.preferredCountries ?? []
  });

  if (!prefilter.pass) {
    await logRunEvent(input.logEventsRepository, {
      applicationRunId: run.id,
      jobId: job.id,
      level: 'warn',
      message: 'Skipped application run after applicant prefilter rejection.',
      details: {
        applicationRunId: run.id,
        siteKey: siteFlow.siteKey,
        step: 'prefilter',
        prefilterReasons: prefilter.reasons
      }
    });

    const skippedRun = await input.applicationRunsRepository.update(run.id, {
      status: 'skipped',
      currentStep: 'prefilter_rejected',
      stopReason: 'prefilter_rejected',
      prefilterReasons: prefilter.reasons,
      completedAt: new Date(),
      updatedAt: new Date()
    });
    if (!skippedRun) {
      throw new Error(`Application run ${run.id} was not found for skip update.`);
    }
    return skippedRun;
  }

  const artifacts = await resolveArtifacts({
    jobId: job.id,
    run: existingRun,
    artifactsRepository: input.artifactsRepository
  });

  const runningRun = await input.applicationRunsRepository.update(run.id, {
    status: 'running',
    currentStep: existingRun?.currentStep ?? 'starting',
    resumeArtifactId: artifacts.resume?.id ?? null,
    coverLetterArtifactId: artifacts.coverLetter?.id ?? null,
    startedAt: existingRun?.startedAt ?? new Date(),
    updatedAt: new Date()
  });
  if (!runningRun) {
    throw new Error(`Application run ${run.id} was not found for start update.`);
  }

  await logRunEvent(input.logEventsRepository, {
    applicationRunId: runningRun.id,
    jobId: job.id,
    level: 'info',
    message: 'Started application run.',
    details: {
      applicationRunId: runningRun.id,
      siteKey: siteFlow.siteKey,
      step: runningRun.currentStep
    }
  });

  const browser = await (
    input.createBrowser ??
    (() =>
      createDiscoveryBrowser({
        headless: process.env.JOBAUTOMATION_APPLICATION_BROWSER_HEADED !== '1'
      }))
  )();
  const session = await (input.createSession ?? createApplicationSession)({
    browser,
    runId: runningRun.id,
    artifactsRootDir: input.artifactsRootDir ?? 'output/artifacts',
    startUrl: job.sourceUrl
  });

  let finalTraceStopped = false;
  let leaveBrowserOpenForManualReview = false;

  try {
    const result = await siteFlow.run({
      applicantProfile,
      artifacts,
      fieldMapping: buildApplicationFieldMapping(applicantProfile),
      job,
      run: runningRun,
      session,
      logStep: async (step, message, details = {}) => {
        await logRunEvent(input.logEventsRepository, {
          applicationRunId: runningRun.id,
          jobId: job.id,
          level: 'info',
          message,
          details: {
            applicationRunId: runningRun.id,
            siteKey: siteFlow.siteKey,
            step,
            pageUrl: session.page.url(),
            ...details
          }
        });
      },
      captureScreenshot: async ({ step, message, details = {} }) => {
        if (!input.artifactsRepository.create) {
          throw new Error('Artifacts repository does not support application evidence persistence.');
        }

        const artifactsRootDir = input.artifactsRootDir ?? 'output/artifacts';
        const directoryPath = join(artifactsRootDir, 'applications', runningRun.id);
        await mkdir(directoryPath, { recursive: true });

        const fileName = `${sanitizeSegment(siteFlow.siteKey)}-${sanitizeSegment(step)}-${Date.now()}.png`;
        const storagePath = join(directoryPath, fileName);
        const screenshot = await session.page.screenshot({ fullPage: true });
        await writeFile(storagePath, screenshot);

        const artifact = await input.artifactsRepository.create({
          jobId: job.id,
          applicationRunId: runningRun.id,
          kind: 'application-screenshot',
          format: 'png',
          fileName: basename(storagePath),
          storagePath,
          createdAt: new Date()
        });

        await logRunEvent(input.logEventsRepository, {
          applicationRunId: runningRun.id,
          jobId: job.id,
          level: 'info',
          message,
          details: {
            applicationRunId: runningRun.id,
            siteKey: siteFlow.siteKey,
            step,
            pageUrl: session.page.url(),
            artifactId: artifact.id,
            ...details
          }
        });

        return {
          artifactId: artifact.id,
          storagePath
        };
      },
      stopBeforeSubmit: async ({ step, reviewUrl, details }) => {
        finalTraceStopped = true;
        return stopBeforeSubmit({
          run: runningRun,
          page: {
            screenshot: session.page.screenshot.bind(session.page),
            url: () => reviewUrl ?? session.page.url()
          },
          step,
          siteKey: siteFlow.siteKey,
          ...(details !== undefined ? { details } : {}),
          artifactsRootDir: input.artifactsRootDir ?? 'output/artifacts',
          applicationRunsRepository: {
            update: async (id, patch) => {
              const updated = await input.applicationRunsRepository.update(id, patch);
              if (!updated) {
                throw new Error(`Application run ${id} was not found for pause update.`);
              }
              return updated;
            }
          },
          artifactsRepository: {
            create: async (artifactInput) => {
              if (!input.artifactsRepository.create) {
                throw new Error('Artifacts repository does not support application evidence persistence.');
              }

              return input.artifactsRepository.create(artifactInput);
            }
          },
          logEventsRepository: input.logEventsRepository,
          finalizeTrace: async (tracePath) => {
            await session.context.tracing.stop({
              path: tracePath
            });
          }
        });
      }
    });

    const headedApply = process.env.JOBAUTOMATION_APPLICATION_BROWSER_HEADED === '1';
    const forceCloseBrowser = process.env.JOBAUTOMATION_APPLICATION_AUTO_CLOSE_BROWSER === '1';
    if (result.status === 'paused' && headedApply && !forceCloseBrowser) {
      leaveBrowserOpenForManualReview = true;
    }

    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown application automation error.';
    await logRunEvent(input.logEventsRepository, {
      applicationRunId: runningRun.id,
      jobId: job.id,
      level: 'error',
      message: 'Application run failed.',
      details: {
        applicationRunId: runningRun.id,
        siteKey: siteFlow.siteKey,
        step: runningRun.currentStep,
        pageUrl: session.page.url(),
        errorMessage: message
      }
    });

    const failedRun = await input.applicationRunsRepository.update(runningRun.id, {
      status: 'failed',
      stopReason: 'automation_error',
      completedAt: new Date(),
      updatedAt: new Date()
    });
    if (!failedRun) {
      throw new Error(`Application run ${runningRun.id} was not found for failure update.`);
    }
    return failedRun;
  } finally {
    if (!finalTraceStopped) {
      try {
        await session.finalizeTrace();
      } catch {
        // Preserve the original failure path; trace persistence is best-effort unless we pause.
      }
    }

    if (leaveBrowserOpenForManualReview) {
      await logRunEvent(input.logEventsRepository, {
        applicationRunId: runningRun.id,
        jobId: job.id,
        level: 'info',
        message:
          'Automation Chromium window left open: partial draft lives only in that tab. Finish custom questions there, submit when ready, then close the window.',
        details: {
          applicationRunId: runningRun.id,
          siteKey: siteFlow.siteKey,
          step: 'browser_left_open_for_review',
          pageUrl: session.page.url(),
          reviewUrlBehavior: 'session_local_until_submit'
        }
      });
    } else {
      await session.close();
    }
  }
}
