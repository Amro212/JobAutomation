import PQueue from 'p-queue';
import { dirname, join } from 'node:path';

import {
  ashbyApplicationSite,
  greenhouseApplicationSite,
  leverApplicationSite,
  runApplication,
  runPlaywrightDiscovery
} from '@jobautomation/automation';
import type { AppEnv } from '@jobautomation/config';
import type { DiscoverySourceRecord, JobRecord } from '@jobautomation/core';
import type {
  ApiRepositories
} from '../plugins/db';
import { runStructuredDiscovery } from '@jobautomation/discovery';

import { generateJobArtifactsForJob } from './generate-job-artifacts';
import { recomputeJobPrefilterMatches } from './job-prefilter-recompute';

export type QueueAutopilotRunInput = {
  run: Awaited<ReturnType<ApiRepositories['autopilotRuns']['create']>>;
  sources: DiscoverySourceRecord[];
};

function applicationSites() {
  return [
    greenhouseApplicationSite,
    leverApplicationSite,
    ashbyApplicationSite
  ];
}

async function jobAlreadySubmitted(
  repositories: ApiRepositories,
  job: JobRecord
): Promise<boolean> {
  if (job.status === 'applied') {
    return true;
  }

  const runs = await repositories.applicationRuns.listByJob(job.id);
  return runs.some((run) => run.status === 'completed');
}

function latestPdfArtifact(
  artifacts: Awaited<ReturnType<typeof generateJobArtifactsForJob>>['artifacts'],
  kind: string
) {
  return artifacts
    .filter((artifact) => artifact.kind === kind && artifact.format === 'pdf')
    .sort((a, b) => {
      if (b.version !== a.version) {
        return b.version - a.version;
      }

      return b.createdAt.getTime() - a.createdAt.getTime();
    })[0] ?? null;
}

function finalAutopilotStatus(input: {
  submittedCount: number;
  blockedCount: number;
  failedCount: number;
}): 'completed' | 'partial' | 'failed' {
  if (input.blockedCount === 0 && input.failedCount === 0) {
    return 'completed';
  }

  if (input.submittedCount > 0) {
    return 'partial';
  }

  return 'failed';
}

export class AutopilotQueueService {
  private readonly queue: PQueue;
  private readonly runStructuredDiscoveryImpl: typeof runStructuredDiscovery;
  private readonly runPlaywrightDiscoveryImpl: typeof runPlaywrightDiscovery;
  private readonly generateArtifactsImpl: typeof generateJobArtifactsForJob;
  private readonly runApplicationImpl: typeof runApplication;

  constructor(
    private readonly input: {
      repositories: ApiRepositories;
      config: AppEnv;
      runStructuredDiscoveryImpl?: typeof runStructuredDiscovery;
      runPlaywrightDiscoveryImpl?: typeof runPlaywrightDiscovery;
      generateArtifactsImpl?: typeof generateJobArtifactsForJob;
      runApplicationImpl?: typeof runApplication;
    }
  ) {
    this.queue = new PQueue({ concurrency: 1 });
    this.runStructuredDiscoveryImpl =
      input.runStructuredDiscoveryImpl ?? runStructuredDiscovery;
    this.runPlaywrightDiscoveryImpl =
      input.runPlaywrightDiscoveryImpl ?? runPlaywrightDiscovery;
    this.generateArtifactsImpl =
      input.generateArtifactsImpl ?? generateJobArtifactsForJob;
    this.runApplicationImpl = input.runApplicationImpl ?? runApplication;
  }

  enqueueRun(input: QueueAutopilotRunInput): void {
    void this.queue
      .add(async () => {
        await this.executeRun(input);
      })
      .catch(() => {
        // execution handles its own failure state
      });
  }

  async onIdle(): Promise<void> {
    await this.queue.onIdle();
  }

  private async executeRun(input: QueueAutopilotRunInput): Promise<void> {
    const run = await this.input.repositories.autopilotRuns.update(input.run.id, {
      status: 'running',
      currentStep: 'discovery_running',
      startedAt: new Date()
    });
    if (!run) {
      return;
    }

    try {
      const discoveryRun = await this.input.repositories.discoveryRuns.create({
        sourceKind:
          input.sources.length === 1 ? input.sources[0]!.sourceKind : 'structured',
        runKind: input.sources.length === 1 ? 'single-source' : 'structured',
        triggerKind: 'manual',
        discoverySourceId: input.sources.length === 1 ? input.sources[0]!.id : null,
        status: 'pending'
      });

      await this.input.repositories.autopilotRuns.update(run.id, {
        discoveryRunId: discoveryRun.id
      });

      if (input.sources.length === 1 && input.sources[0]?.sourceKind === 'playwright') {
        await this.runPlaywrightDiscoveryImpl({
          run: discoveryRun,
          source: input.sources[0],
          jobsRepository: this.input.repositories.jobs,
          runsRepository: this.input.repositories.discoveryRuns,
          logEventsRepository: this.input.repositories.logEvents,
          artifactsRepository: this.input.repositories.artifacts,
          artifactsRootDir: join(
            dirname(this.input.config.JOB_AUTOMATION_DB_PATH),
            'artifacts'
          )
        });
      } else {
        await this.runStructuredDiscoveryImpl({
          run: discoveryRun,
          sources: input.sources,
          jobsRepository: this.input.repositories.jobs,
          runsRepository: this.input.repositories.discoveryRuns,
          logEventsRepository: this.input.repositories.logEvents,
          greenhouseBaseUrl: this.input.config.GREENHOUSE_API_BASE_URL,
          leverBaseUrl: this.input.config.LEVER_API_BASE_URL,
          ashbyBaseUrl: this.input.config.ASHBY_API_BASE_URL
        });
      }

      const profile = await this.input.repositories.applicantProfile.get();
      await recomputeJobPrefilterMatches(this.input.repositories.jobs, profile);

      const jobs = await this.input.repositories.jobs.listByDiscoveryRun(discoveryRun.id);
      let discoveredJobCount = jobs.length;
      let eligibleJobCount = 0;
      let skippedJobCount = 0;
      let submittedCount = 0;
      let blockedCount = 0;
      let failedCount = 0;

      await this.input.repositories.autopilotRuns.update(run.id, {
        currentStep: 'applications_running',
        discoveredJobCount
      });

      for (const job of jobs) {
        const matchedSite = applicationSites().find((site) => site.supports(job));
        const supported = Boolean(matchedSite);
        const alreadySubmitted = await jobAlreadySubmitted(
          this.input.repositories,
          job
        );
        if (!supported || job.prefilterPass !== true || alreadySubmitted) {
          skippedJobCount += 1;
          await this.updateCounts(run.id, {
            discoveredJobCount,
            eligibleJobCount,
            skippedJobCount,
            submittedCount,
            blockedCount,
            failedCount
          });
          continue;
        }

        eligibleJobCount += 1;

        try {
          const generated = await this.generateArtifactsImpl({
            jobId: job.id,
            mode: 'both',
            repositories: {
              applicantProfile: this.input.repositories.applicantProfile,
              artifacts: this.input.repositories.artifacts,
              jobs: this.input.repositories.jobs
            },
            config: this.input.config
          });

          const resumeArtifact = latestPdfArtifact(
            generated.artifacts,
            'resume-variant'
          );
          const coverLetterArtifact = latestPdfArtifact(
            generated.artifacts,
            'cover-letter'
          );

          const createdRun = await this.input.repositories.applicationRuns.create({
            jobId: job.id,
            autopilotRunId: run.id,
            siteKey: matchedSite!.siteKey,
            status: 'pending',
            currentStep: 'queued',
            prefilterReasons: [],
            resumeArtifactId: resumeArtifact?.id ?? null,
            coverLetterArtifactId: coverLetterArtifact?.id ?? null
          });

          const result = await this.runApplicationImpl({
            jobId: job.id,
            runId: createdRun.id,
            jobsRepository: this.input.repositories.jobs,
            applicantProfileRepository: this.input.repositories.applicantProfile,
            applicationRunsRepository: this.input.repositories.applicationRuns,
            artifactsRepository: this.input.repositories.artifacts,
            logEventsRepository: this.input.repositories.logEvents,
            siteFlows: applicationSites(),
            openRouter: this.input.config.OPENROUTER_API_KEY
              ? {
                  apiKey: this.input.config.OPENROUTER_API_KEY,
                  baseUrl: this.input.config.OPENROUTER_API_BASE_URL,
                  model:
                    this.input.config.OPENROUTER_APPLICATION_FILL_PLAN_MODEL ??
                    this.input.config.OPENROUTER_JOB_SUMMARY_MODEL!
                }
              : null,
            artifactsRootDir: join(
              dirname(this.input.config.JOB_AUTOMATION_DB_PATH),
              'artifacts'
            )
          });

          if (result.status === 'completed') {
            submittedCount += 1;
            await this.input.repositories.jobs.updateStatus(job.id, 'applied');
          } else if (result.status === 'failed') {
            failedCount += 1;
          } else if (result.status === 'skipped') {
            skippedJobCount += 1;
          } else {
            blockedCount += 1;
          }
        } catch {
          failedCount += 1;
        }

        await this.updateCounts(run.id, {
          discoveredJobCount,
          eligibleJobCount,
          skippedJobCount,
          submittedCount,
          blockedCount,
          failedCount
        });
      }

      await this.input.repositories.autopilotRuns.update(run.id, {
        status: finalAutopilotStatus({
          submittedCount,
          blockedCount,
          failedCount
        }),
        currentStep: 'applications_completed',
        discoveredJobCount,
        eligibleJobCount,
        skippedJobCount,
        submittedCount,
        blockedCount,
        failedCount,
        completedAt: new Date()
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown autopilot queue error.';

      await this.input.repositories.autopilotRuns.update(run.id, {
        status: 'failed',
        currentStep: 'failed',
        errorMessage: message,
        completedAt: new Date()
      });
    }
  }

  private async updateCounts(
    runId: string,
    counters: {
      discoveredJobCount: number;
      eligibleJobCount: number;
      skippedJobCount: number;
      submittedCount: number;
      blockedCount: number;
      failedCount: number;
    }
  ): Promise<void> {
    await this.input.repositories.autopilotRuns.update(runId, counters);
  }
}
