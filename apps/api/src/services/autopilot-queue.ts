import PQueue from 'p-queue';
import { dirname, join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import {
  ashbyApplicationSite,
  greenhouseApplicationSite,
  leverApplicationSite,
  runApplication,
  runPlaywrightDiscovery
} from '@jobautomation/automation';
import type { AppEnv } from '@jobautomation/config';
import type {
  AutopilotConfig,
  DiscoverySourceRecord,
  JobListFilters
} from '@jobautomation/core';
import type {
  ApiRepositories
} from '../plugins/db';
import { runStructuredDiscovery } from '@jobautomation/discovery';
import type { OpenRouterConfig } from '@jobautomation/llm';

import { generateJobArtifactsForJob } from './generate-job-artifacts';
import { reviewJobMatchWithLlm } from './job-match-llm-review';
import { autopilotJobPoolFilters } from './jobs-tab-filters';
import { recomputeJobPrefilterMatches } from './job-prefilter-recompute';

const execFileAsync = promisify(execFile);
const DEFAULT_APPLICATION_STUCK_TIMEOUT_MS = 10 * 60 * 1000;
const DEFAULT_ARTIFACT_GENERATION_MAX_ATTEMPTS = 3;
const ARTIFACT_GENERATION_RETRY_DELAY_MS = 750;

class ApplicationRunTimeoutError extends Error {
  constructor(readonly timeoutMs: number) {
    super(`Application run exceeded watchdog timeout of ${timeoutMs}ms.`);
    this.name = 'ApplicationRunTimeoutError';
  }
}

class ArtifactGenerationError extends Error {
  constructor(
    message: string,
    readonly details: {
      attempts: number;
      failureReasons: string[];
    }
  ) {
    super(message);
    this.name = 'ArtifactGenerationError';
  }
}

class AutopilotAbortError extends Error {
  constructor() {
    super('Autopilot run was cancelled.');
    this.name = 'AutopilotAbortError';
  }
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    throw new AutopilotAbortError();
  }
}

export type QueueAutopilotRunInput = {
  run: Awaited<ReturnType<ApiRepositories['autopilotRuns']['create']>>;
  sources: DiscoverySourceRecord[];
  config: AutopilotConfig;
};

function allApplicationSites() {
  return [greenhouseApplicationSite, leverApplicationSite, ashbyApplicationSite];
}

function applicationSitesForConfig(config: AutopilotConfig) {
  return allApplicationSites().filter((site) =>
    config.applySiteKeys.includes(site.siteKey)
  );
}

function discoverySourcesForConfig(
  sources: DiscoverySourceRecord[],
  config: AutopilotConfig
): DiscoverySourceRecord[] {
  if (config.discoverySourceIds.length === 0) {
    return sources;
  }

  const selectedIds = new Set(config.discoverySourceIds);
  return sources.filter((source) => selectedIds.has(source.id));
}

function shouldSkipDiscovery(
  latestCompletedAt: Date | null,
  config: AutopilotConfig
): boolean {
  if (config.forceFreshDiscovery) {
    return false;
  }
  if (!latestCompletedAt) {
    return false;
  }
  if (config.discoveryCacheHours <= 0) {
    return false;
  }

  const cacheTtlMs = config.discoveryCacheHours * 60 * 60 * 1000;
  const cutoff = new Date(Date.now() - cacheTtlMs);
  return latestCompletedAt > cutoff;
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

function openRouterConfigForModel(
  config: AppEnv,
  model: string | undefined,
  options?: { enableReasoning?: boolean }
): OpenRouterConfig | null {
  if (!config.OPENROUTER_API_KEY || !model) {
    return null;
  }

  return {
    apiKey: config.OPENROUTER_API_KEY,
    baseUrl: config.OPENROUTER_API_BASE_URL,
    model,
    ...(options?.enableReasoning
      ? {
          reasoning: {
            enabled: true,
            exclude: true
          }
        }
      : {})
  };
}

const AUTOPILOT_JOB_ID_PAGE_SIZE = 300;

async function collectAutopilotJobIds(input: {
  repositories: ApiRepositories;
  filters: JobListFilters;
  maxJobsPerRun: number | null;
}): Promise<string[]> {
  const selectedIds: string[] = [];
  let page = 1;

  for (;;) {
    // skipCount: the autopilot queue never uses the total, so avoid the expensive COUNT
    const { ids } = await input.repositories.jobs.listIds(input.filters, {
      page,
      pageSize: AUTOPILOT_JOB_ID_PAGE_SIZE
    }, { skipCount: true });

    if (ids.length === 0) {
      break;
    }

    const completedJobIds = await input.repositories.applicationRuns.completedJobIds(ids);
    for (const id of ids) {
      if (completedJobIds.has(id)) {
        continue;
      }

      selectedIds.push(id);
      if (
        input.maxJobsPerRun !== null &&
        selectedIds.length >= input.maxJobsPerRun
      ) {
        return selectedIds;
      }
    }

    if (ids.length < AUTOPILOT_JOB_ID_PAGE_SIZE) {
      break;
    }

    page += 1;
  }

  return selectedIds;
}

export class AutopilotQueueService {
  private readonly queue: PQueue;
  private readonly runStructuredDiscoveryImpl: typeof runStructuredDiscovery;
  private readonly runPlaywrightDiscoveryImpl: typeof runPlaywrightDiscovery;
  private readonly generateArtifactsImpl: typeof generateJobArtifactsForJob;
  private readonly runApplicationImpl: typeof runApplication;
  private readonly reviewJobMatchImpl: typeof reviewJobMatchWithLlm;
  private readonly abortControllers = new Map<string, AbortController>();

  constructor(
    private readonly input: {
      repositories: ApiRepositories;
      config: AppEnv;
      runStructuredDiscoveryImpl?: typeof runStructuredDiscovery;
      runPlaywrightDiscoveryImpl?: typeof runPlaywrightDiscovery;
      generateArtifactsImpl?: typeof generateJobArtifactsForJob;
      runApplicationImpl?: typeof runApplication;
      reviewJobMatchImpl?: typeof reviewJobMatchWithLlm;
      applicationRunTimeoutMs?: number;
      staleApplicationRunThresholdMs?: number;
      terminateCamoufoxImpl?: () => Promise<void>;
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
    this.reviewJobMatchImpl = input.reviewJobMatchImpl ?? reviewJobMatchWithLlm;
    this.applicationRunTimeoutMs =
      input.applicationRunTimeoutMs ?? DEFAULT_APPLICATION_STUCK_TIMEOUT_MS;
    this.staleApplicationRunThresholdMs =
      input.staleApplicationRunThresholdMs ?? DEFAULT_APPLICATION_STUCK_TIMEOUT_MS;
    this.terminateCamoufoxImpl =
      input.terminateCamoufoxImpl ?? (() => this.terminateCamoufoxProcessesDefault());
  }

  private readonly applicationRunTimeoutMs: number;
  private readonly staleApplicationRunThresholdMs: number;
  private readonly terminateCamoufoxImpl: () => Promise<void>;
  private readonly artifactGenerationMaxAttempts = DEFAULT_ARTIFACT_GENERATION_MAX_ATTEMPTS;

  enqueueRun(input: QueueAutopilotRunInput): void {
    const controller = new AbortController();
    this.abortControllers.set(input.run.id, controller);

    void this.queue
      .add(async () => {
        try {
          await this.executeRun(input, controller.signal);
        } finally {
          this.abortControllers.delete(input.run.id);
        }
      })
      .catch(() => {
        // execution handles its own failure state
      });
  }

  requestCancelRun(runId: string): boolean {
    const cancelledActiveRun = this.abortRun(runId);
    void this.persistCancelledRun(runId).catch(() => null);
    return cancelledActiveRun;
  }

  async cancelRun(runId: string): Promise<boolean> {
    const cancelledActiveRun = this.abortRun(runId);
    await this.persistCancelledRun(runId);
    return cancelledActiveRun;
  }

  private abortRun(runId: string): boolean {
    const controller = this.abortControllers.get(runId);
    this.queue.clear();
    controller?.abort();
    this.abortControllers.delete(runId);

    void this.terminateCamoufoxImpl().catch(() => null);

    return Boolean(controller);
  }

  private async persistCancelledRun(runId: string): Promise<void> {
    await this.cancelRunningApplicationRuns(runId);

    await this.input.repositories.autopilotRuns.update(runId, {
      status: 'cancelled',
      currentStep: 'cancelled',
      completedAt: new Date()
    });
  }

  async onIdle(): Promise<void> {
    await this.queue.onIdle();
  }

  private async executeRun(input: QueueAutopilotRunInput, signal: AbortSignal): Promise<void> {
    const run = await this.input.repositories.autopilotRuns.update(input.run.id, {
      status: 'running',
      currentStep: 'discovery_running',
      startedAt: new Date()
    });
    if (!run) {
      return;
    }

    try {
      await this.recoverStaleRunningApplicationRuns(run.id);

      throwIfAborted(signal);

      let discoveryRunId: string;
      const selectedSources = discoverySourcesForConfig(input.sources, input.config);
      const activeApplicationSites = applicationSitesForConfig(input.config);
      const latestDiscoveryRun = await this.input.repositories.discoveryRuns.findLatestCompleted();
      const reuseDiscovery = shouldSkipDiscovery(
        latestDiscoveryRun?.completedAt ?? null,
        input.config
      );

      if (reuseDiscovery && latestDiscoveryRun) {
        discoveryRunId = latestDiscoveryRun.id;
        await this.input.repositories.autopilotRuns.update(run.id, {
          discoveryRunId,
          currentStep: 'discovery_skipped'
        });
      } else {
        const discoveryRun = await this.input.repositories.discoveryRuns.create({
          sourceKind:
            selectedSources.length === 1
              ? selectedSources[0]!.sourceKind
              : 'structured',
          runKind: selectedSources.length === 1 ? 'single-source' : 'structured',
          triggerKind: 'manual',
          discoverySourceId: selectedSources.length === 1 ? selectedSources[0]!.id : null,
          status: 'pending'
        });

        discoveryRunId = discoveryRun.id;

        await this.input.repositories.autopilotRuns.update(run.id, {
          discoveryRunId: discoveryRun.id
        });

        if (
          selectedSources.length === 1 &&
          selectedSources[0]?.sourceKind === 'playwright'
        ) {
          await this.runPlaywrightDiscoveryImpl({
            run: discoveryRun,
            source: selectedSources[0],
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
            sources: selectedSources,
            sourcesRepository: this.input.repositories.discoverySources,
            jobsRepository: this.input.repositories.jobs,
            runsRepository: this.input.repositories.discoveryRuns,
            logEventsRepository: this.input.repositories.logEvents,
            greenhouseBaseUrl: this.input.config.GREENHOUSE_API_BASE_URL,
            leverBaseUrl: this.input.config.LEVER_API_BASE_URL,
            ashbyBaseUrl: this.input.config.ASHBY_API_BASE_URL
          });
        }

        await this.input.repositories.autopilotRuns.update(run.id, {
          currentStep: 'discovery_completed'
        });
      }

      throwIfAborted(signal);

      await this.input.repositories.autopilotRuns.update(run.id, {
        currentStep: 'prefilter_running'
      });

      const profile = await this.input.repositories.applicantProfile.get();
      await recomputeJobPrefilterMatches(this.input.repositories.jobs, profile, {
        mode: 'stale'
      });

      throwIfAborted(signal);

      await this.input.repositories.autopilotRuns.update(run.id, {
        currentStep: 'prefilter_completed'
      });

      const jobsTabFilters = autopilotJobPoolFilters(profile, input.config);
      const selectedJobIds = await collectAutopilotJobIds({
        repositories: this.input.repositories,
        filters: jobsTabFilters,
        maxJobsPerRun: input.config.maxJobsPerRun
      });
      const discoveredJobCount = selectedJobIds.length;
      let eligibleJobCount = 0;
      let skippedJobCount = 0;
      let submittedCount = 0;
      let blockedCount = 0;
      let failedCount = 0;

      await this.input.repositories.autopilotRuns.update(run.id, {
        currentStep: 'applications_running',
        discoveredJobCount
      });

      for (const jobId of selectedJobIds) {
        if (signal.aborted) {
          break;
        }

        const job = await this.input.repositories.jobs.findById(jobId);
        if (!job) {
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

        const matchedSite = activeApplicationSites.find((site) => site.supports(job));
        const supported = Boolean(matchedSite);
        if (!supported) {
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

        throwIfAborted(signal);

        const matchReview = await this.reviewJobMatchImpl({
          job,
          applicantProfile: profile,
          openRouter: openRouterConfigForModel(
            this.input.config,
            this.input.config.OPENROUTER_JOB_SUMMARY_MODEL ??
              this.input.config.OPENROUTER_APPLICATION_FILL_PLAN_MODEL
          )
        });

        if (matchReview.reviewed) {
          await this.input.repositories.jobs.updatePrefilterResult(job.id, {
            pass: matchReview.pass,
            score: matchReview.score,
            reasons: matchReview.reasons,
            audit: matchReview.audit
          });
        }

        if (!matchReview.pass) {
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

        let createdRunId: string | null = null;
        try {
          throwIfAborted(signal);

          await this.input.repositories.autopilotRuns.update(run.id, {
            currentStep: `generating_artifacts:${job.title}`
          });

          const generatedArtifacts = await this.generateArtifactsWithRetries({
            jobId: job.id,
            mode: input.config.artifactMode
          });

          const createdRun = await this.input.repositories.applicationRuns.create({
            jobId: job.id,
            autopilotRunId: run.id,
            siteKey: matchedSite!.siteKey,
            status: 'pending',
            currentStep: 'queued',
            prefilterReasons: [],
            resumeArtifactId: generatedArtifacts.resumeArtifact.id,
            coverLetterArtifactId: generatedArtifacts.coverLetterArtifact?.id ?? null
          });
          createdRunId = createdRun.id;

          await this.input.repositories.autopilotRuns.update(run.id, {
            currentStep: `submitting_application:${job.title}`
          });

          throwIfAborted(signal);

          const result = await this.runApplicationWithWatchdog(
            () =>
              this.runApplicationImpl({
                jobId: job.id,
                runId: createdRun.id,
                jobsRepository: this.input.repositories.jobs,
                applicantProfileRepository: this.input.repositories.applicantProfile,
                applicationRunsRepository: this.input.repositories.applicationRuns,
                artifactsRepository: this.input.repositories.artifacts,
                logEventsRepository: this.input.repositories.logEvents,
                siteFlows: activeApplicationSites,
                // Batch autopilot must close headed browsers on pause so the next job
                // can reuse the same persistent profile without spawning empty windows.
                leaveBrowserOpenOnPause: false,
                openRouter: openRouterConfigForModel(
                  this.input.config,
                  this.input.config.OPENROUTER_APPLICATION_FILL_PLAN_MODEL ??
                    this.input.config.OPENROUTER_JOB_SUMMARY_MODEL,
                  { enableReasoning: true }
                ),
                artifactsRootDir: join(
                  dirname(this.input.config.JOB_AUTOMATION_DB_PATH),
                  'artifacts'
                )
              }),
            signal
          );

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
        } catch (error) {
          if (error instanceof AutopilotAbortError || signal.aborted) {
            if (createdRunId) {
              await this.input.repositories.applicationRuns
                .update(createdRunId, {
                  status: 'failed',
                  currentStep: 'cancelled',
                  stopReason: 'autopilot_cancelled',
                  completedAt: new Date(),
                  updatedAt: new Date()
                })
                .catch(() => null);
            }

            break;
          }

          if (error instanceof ApplicationRunTimeoutError) {
            blockedCount += 1;
            await this.terminateCamoufoxImpl();
            if (createdRunId) {
              await this.input.repositories.applicationRuns
                .update(createdRunId, {
                  status: 'retry',
                  currentStep: 'retry_queued',
                  stopReason: 'stuck_timeout',
                  completedAt: new Date(),
                  updatedAt: new Date()
                })
                .catch(() => null);
            }
            await this.input.repositories.logEvents
              .create({
                applicationRunId: createdRunId,
                jobId: job.id,
                level: 'warn',
                message:
                  'Autopilot watchdog timed out this application run; Camoufox was terminated and run was re-queued.',
                detailsJson: JSON.stringify({
                  applicationRunId: createdRunId,
                  jobId: job.id,
                  siteKey: matchedSite!.siteKey,
                  timeoutMs: error.timeoutMs
                })
              })
              .catch(() => null);
          } else if (error instanceof ArtifactGenerationError) {
            failedCount += 1;
            if (!createdRunId) {
              const failedRun = await this.input.repositories.applicationRuns.create({
                jobId: job.id,
                autopilotRunId: run.id,
                siteKey: matchedSite!.siteKey,
                status: 'failed',
                currentStep: 'artifact_generation_failed',
                stopReason: 'artifact_generation_failed',
                prefilterReasons: [],
                completedAt: new Date()
              });
              createdRunId = failedRun.id;
            }
            await this.input.repositories.logEvents
              .create({
                applicationRunId: createdRunId,
                jobId: job.id,
                level: 'error',
                message:
                  'Autopilot could not generate a required resume PDF artifact after retries.',
                detailsJson: JSON.stringify({
                  applicationRunId: createdRunId,
                  jobId: job.id,
                  siteKey: matchedSite!.siteKey,
                  attempts: error.details.attempts,
                  failureReasons: error.details.failureReasons
                })
              })
              .catch(() => null);
          } else {
            failedCount += 1;
            // runApplicationImpl can throw before its own catch (e.g. browser
            // launch failure). Persist 'failed' so the run never stays stuck in
            // 'running'.
            if (createdRunId) {
              await this.input.repositories.applicationRuns
                .update(createdRunId, {
                  status: 'failed',
                  currentStep: 'autopilot_error',
                  stopReason: 'autopilot_error',
                  completedAt: new Date(),
                  updatedAt: new Date()
                })
                .catch(() => null);
            }
            await this.input.repositories.logEvents
              .create({
                applicationRunId: createdRunId,
                jobId: job.id,
                level: 'error',
                message:
                  'Autopilot application run threw before completion; marked as failed.',
                detailsJson: JSON.stringify({
                  applicationRunId: createdRunId,
                  jobId: job.id,
                  siteKey: matchedSite!.siteKey,
                  errorMessage:
                    error instanceof Error ? error.message : String(error)
                })
              })
              .catch(() => null);
          }
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

      if (signal.aborted) {
        // cancelRun() already updated status; just persist final counts
        await this.updateCounts(run.id, {
          discoveredJobCount,
          eligibleJobCount,
          skippedJobCount,
          submittedCount,
          blockedCount,
          failedCount
        });
      } else {
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
      }
    } catch (error) {
      // AutopilotAbortError means cancelRun() was called and already persisted
      // the 'cancelled' status — no need to overwrite it with 'failed'.
      if (error instanceof AutopilotAbortError || signal.aborted) {
        return;
      }

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

  private async cancelRunningApplicationRuns(autopilotRunId: string): Promise<void> {
    const runningRuns = await this.input.repositories.applicationRuns.listByAutopilotRun(
      autopilotRunId
    );

    const now = new Date();
    await Promise.all(
      runningRuns
        .filter((run) => run.status === 'running' || run.status === 'pending')
        .map((run) =>
          this.input.repositories.applicationRuns
            .update(run.id, {
              status: 'failed',
              currentStep: 'cancelled',
              stopReason: 'autopilot_cancelled',
              completedAt: now,
              updatedAt: now
            })
            .catch(() => null)
        )
    );
  }

  private async generateArtifactsWithRetries(input: {
    jobId: string;
    mode: AutopilotConfig['artifactMode'];
  }): Promise<{
    generated: Awaited<ReturnType<typeof generateJobArtifactsForJob>>;
    resumeArtifact: NonNullable<ReturnType<typeof latestPdfArtifact>>;
    coverLetterArtifact: ReturnType<typeof latestPdfArtifact>;
  }> {
    const failureReasons: string[] = [];
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.artifactGenerationMaxAttempts; attempt += 1) {
      try {
        const generated = await this.generateArtifactsImpl({
          jobId: input.jobId,
          mode: input.mode,
          repositories: {
            applicantProfile: this.input.repositories.applicantProfile,
            artifacts: this.input.repositories.artifacts,
            jobs: this.input.repositories.jobs
          },
          config: this.input.config
        });
        const resumeArtifact = latestPdfArtifact(generated.artifacts, 'resume-variant');
        const coverLetterArtifact = latestPdfArtifact(generated.artifacts, 'cover-letter');
        if (resumeArtifact) {
          return {
            generated,
            resumeArtifact,
            coverLetterArtifact
          };
        }

        const warningSummary =
          generated.warnings && generated.warnings.length > 0
            ? ` warnings=${generated.warnings.join(' | ')}`
            : '';
        failureReasons.push(`attempt_${attempt}: missing_resume_pdf.${warningSummary}`.trim());
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        failureReasons.push(`attempt_${attempt}: ${lastError.message}`);
      }

      if (attempt < this.artifactGenerationMaxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, ARTIFACT_GENERATION_RETRY_DELAY_MS * attempt));
      }
    }

    const fallbackMessage =
      lastError?.message ?? 'Resume PDF artifact was not produced by artifact generation.';
    throw new ArtifactGenerationError(fallbackMessage, {
      attempts: this.artifactGenerationMaxAttempts,
      failureReasons
    });
  }

  private async runApplicationWithWatchdog<T>(
    operation: () => Promise<T>,
    signal: AbortSignal
  ): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | null = null;
    try {
      return await Promise.race([
        operation(),
        new Promise<T>((_, reject) => {
          timer = setTimeout(() => {
            reject(new ApplicationRunTimeoutError(this.applicationRunTimeoutMs));
          }, this.applicationRunTimeoutMs);
        }),
        new Promise<T>((_, reject) => {
          if (signal.aborted) {
            reject(new AutopilotAbortError());
            return;
          }
          signal.addEventListener('abort', () => reject(new AutopilotAbortError()), {
            once: true
          });
        })
      ]);
    } finally {
      if (timer) {
        clearTimeout(timer);
      }
    }
  }

  private async recoverStaleRunningApplicationRuns(
    autopilotRunId: string
  ): Promise<void> {
    const cutoff = Date.now() - this.staleApplicationRunThresholdMs;
    // Only fetch running runs instead of ALL application runs
    const runningRuns = (await this.input.repositories.applicationRuns.listByStatus(['running'])).filter(
      (candidate) => candidate.updatedAt.getTime() < cutoff
    );
    if (runningRuns.length === 0) {
      return;
    }

    await this.terminateCamoufoxImpl();
    for (const staleRun of runningRuns) {
      await this.input.repositories.applicationRuns
        .update(staleRun.id, {
          status: 'retry',
          currentStep: 'retry_queued',
          stopReason: 'stuck_timeout',
          completedAt: new Date(),
          updatedAt: new Date()
        })
        .catch(() => null);
      await this.input.repositories.logEvents
        .create({
          applicationRunId: staleRun.id,
          jobId: staleRun.jobId,
          level: 'warn',
          message:
            'Recovered stale running application run; Camoufox was terminated and run was re-queued.',
          detailsJson: JSON.stringify({
            applicationRunId: staleRun.id,
            previousUpdatedAt: staleRun.updatedAt.toISOString(),
            staleThresholdMs: this.staleApplicationRunThresholdMs,
            recoveredByAutopilotRunId: autopilotRunId
          })
        })
        .catch(() => null);
    }
  }

  private async terminateCamoufoxProcessesDefault(): Promise<void> {
    try {
      if (process.platform === 'win32') {
        await execFileAsync('taskkill', ['/F', '/T', '/IM', 'camoufox.exe']);
        return;
      }
      await execFileAsync('pkill', ['-f', 'camoufox']);
    } catch {
      // Best-effort process cleanup only.
    }
  }
}
