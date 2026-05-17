import { mkdir, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';

import type { DiscoveryRunRecord, DiscoverySourceRecord, LogLevel } from '@jobautomation/core';
import type {
  ArtifactsRepository,
  DiscoveryRunsRepository,
  JobsRepository,
  LogEventsRepository
} from '@jobautomation/db';
import {
  ingestJobsIntoRun,
  normalizeJob,
  type NormalizedJob,
  type SourceAdapter
} from '@jobautomation/discovery';
import type { Browser, BrowserContext, Page } from 'playwright';

import { createDiscoveryBrowser } from '../playwright/browser';
import { evaluateAuthorizedDomainPolicy } from '../playwright/authorized-domain-policy';
import type { ExtractedPlaywrightJob } from './extractors/base-extractor';
import { createGenericListingExtractor } from './extractors/generic-listing-extractor';

type PersistedArtifact = {
  id: string;
  kind: string;
};

type PlaywrightCollectedJob = {
  job: ExtractedPlaywrightJob;
  extractorId: string;
  sourcePageUrl: string;
};

type PlaywrightDiscoveryAdapterInput = {
  run: DiscoveryRunRecord;
  source: DiscoverySourceRecord;
  jobsRepository: JobsRepository;
  runsRepository: DiscoveryRunsRepository;
  logEventsRepository: LogEventsRepository;
  artifactsRepository: ArtifactsRepository;
  artifactsRootDir: string;
  capturedAt?: Date;
  createBrowser?: () => Promise<Browser>;
};

type ArtifactWriteInput = {
  artifactsRepository: ArtifactsRepository;
  artifactsRootDir: string;
  runId: string;
  fileName: string;
  kind: 'fallback-screenshot' | 'fallback-trace' | 'fallback-page-html';
  format: 'png' | 'zip' | 'html';
  content: Buffer | string;
};

function sanitizeFileName(value: string): string {
  return value.replace(/[^a-z0-9._-]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase();
}

function createLogDetails(input: {
  source: DiscoverySourceRecord;
  pageUrl: string;
  extractorId: string;
  artifactIds?: string[];
  errorMessage?: string;
}): Record<string, unknown> {
  return {
    discoverySourceId: input.source.id,
    sourceKind: input.source.sourceKind,
    sourceKey: input.source.sourceKey,
    label: input.source.label,
    pageUrl: input.pageUrl,
    extractorId: input.extractorId,
    ...(input.artifactIds && input.artifactIds.length > 0 ? { artifactIds: input.artifactIds } : {}),
    ...(input.errorMessage ? { errorMessage: input.errorMessage } : {})
  };
}

async function logRunEvent(
  repository: LogEventsRepository,
  input: {
    runId: string;
    level: LogLevel;
    message: string;
    details: Record<string, unknown>;
  }
): Promise<void> {
  await repository.create({
    discoveryRunId: input.runId,
    level: input.level,
    message: input.message,
    detailsJson: JSON.stringify(input.details)
  });
}

async function persistArtifact(input: ArtifactWriteInput): Promise<PersistedArtifact> {
  const directoryPath = join(input.artifactsRootDir, 'discovery-runs', input.runId);
  await mkdir(directoryPath, { recursive: true });

  const storagePath = join(directoryPath, input.fileName);
  await writeFile(storagePath, input.content);

  const artifact = await input.artifactsRepository.create({
    jobId: null,
    discoveryRunId: input.runId,
    kind: input.kind,
    format: input.format,
    fileName: basename(storagePath),
    storagePath,
    createdAt: new Date()
  });

  return {
    id: artifact.id,
    kind: artifact.kind
  };
}

async function persistPageEvidence(input: {
  page: Page;
  artifactsRepository: ArtifactsRepository;
  artifactsRootDir: string;
  runId: string;
  prefix: string;
}): Promise<PersistedArtifact[]> {
  const fileBase = sanitizeFileName(input.prefix);
  const screenshotPath = `${fileBase}.png`;
  const htmlPath = `${fileBase}.html`;

  const screenshot = await input.page.screenshot({ fullPage: true });
  const html = await input.page.content();

  return Promise.all([
    persistArtifact({
      artifactsRepository: input.artifactsRepository,
      artifactsRootDir: input.artifactsRootDir,
      runId: input.runId,
      fileName: screenshotPath,
      kind: 'fallback-screenshot',
      format: 'png',
      content: screenshot
    }),
    persistArtifact({
      artifactsRepository: input.artifactsRepository,
      artifactsRootDir: input.artifactsRootDir,
      runId: input.runId,
      fileName: htmlPath,
      kind: 'fallback-page-html',
      format: 'html',
      content: html
    })
  ]);
}

function createPlaywrightSourceAdapter(
  source: DiscoverySourceRecord
): SourceAdapter<{
  job: ExtractedPlaywrightJob;
  extractorId: string;
  sourcePageUrl: string;
}> {
  return {
    sourceKind: 'playwright',
    normalizeJob(input, context): NormalizedJob {
      return normalizeJob(
        {
          sourceKind: 'playwright',
          sourceId: input.job.sourceId ?? input.job.sourceUrl,
          sourceUrl: input.job.sourceUrl,
          companyName: input.job.companyName ?? source.label,
          title: input.job.title ?? 'Untitled role',
          location: input.job.location,
          remoteType: input.job.remoteType,
          employmentType: input.job.employmentType,
          compensationText: input.job.compensationText,
          descriptionText: input.job.descriptionText,
          rawPayload: {
            sourcePageUrl: input.sourcePageUrl,
            detailPageUrl: input.job.detailPageUrl,
            extractorId: input.extractorId
          }
        },
        {
          capturedAt: context.capturedAt
        }
      );
    }
  };
}

function validateExtractedJob(job: ExtractedPlaywrightJob): string | null {
  if (!job.title) {
    return `Missing required job fields for ${job.detailPageUrl}: title`;
  }

  return null;
}

async function collectJobs(input: {
  context: BrowserContext;
  source: DiscoverySourceRecord;
  artifactsRepository: ArtifactsRepository;
  artifactsRootDir: string;
  runId: string;
  currentPageUrlRef: { value: string };
  artifactIds: string[];
}): Promise<PlaywrightCollectedJob[]> {
  const extractor = createGenericListingExtractor();
  const pages = input.context.pages();
  const sourcePage = pages.length > 0 && pages[0].url() === 'about:blank' 
    ? pages[0] 
    : await input.context.newPage();
  input.currentPageUrlRef.value = input.source.sourceKey;

  await sourcePage.goto(input.source.sourceKey, {
    waitUntil: 'domcontentloaded'
  });

  const sourceArtifacts = await persistPageEvidence({
    page: sourcePage,
    artifactsRepository: input.artifactsRepository,
    artifactsRootDir: input.artifactsRootDir,
    runId: input.runId,
    prefix: `${input.source.label}-source-page`
  });
  input.artifactIds.push(...sourceArtifacts.map((artifact) => artifact.id));

  const detailPageUrls = await extractor.collectDetailPageUrls(sourcePage, input.source.sourceKey);
  if (detailPageUrls.length === 0) {
    throw new Error(`No candidate job detail pages were found for ${input.source.sourceKey}.`);
  }

  const jobs: PlaywrightCollectedJob[] = [];

  for (const detailPageUrl of detailPageUrls) {
    const detailPage = await input.context.newPage();
    input.currentPageUrlRef.value = detailPageUrl;

    try {
      await detailPage.goto(detailPageUrl, {
        waitUntil: 'domcontentloaded'
      });

      const extractedJob = await extractor.extractJob(detailPage, {
        sourcePageUrl: input.source.sourceKey,
        detailPageUrl,
        label: input.source.label
      });

      const validationError = validateExtractedJob(extractedJob);
      if (validationError) {
        const detailArtifacts = await persistPageEvidence({
          page: detailPage,
          artifactsRepository: input.artifactsRepository,
          artifactsRootDir: input.artifactsRootDir,
          runId: input.runId,
          prefix: `${input.source.label}-${detailPageUrl}`
        });
        input.artifactIds.push(...detailArtifacts.map((artifact) => artifact.id));
        throw new Error(validationError);
      }

      jobs.push({
        job: extractedJob,
        extractorId: extractor.id,
        sourcePageUrl: input.source.sourceKey
      });
    } finally {
      await detailPage.close();
    }
  }

  return jobs;
}

export async function runPlaywrightDiscovery(
  input: PlaywrightDiscoveryAdapterInput
): Promise<DiscoveryRunRecord> {
  const scopeDecision = evaluateAuthorizedDomainPolicy(input.source.sourceKey);
  if (!scopeDecision.allowed) {
    const scopeError = `Discovery source is outside the authorized domain policy: ${scopeDecision.reason}.`;

    await logRunEvent(input.logEventsRepository, {
      runId: input.run.id,
      level: 'error',
      message: `Failed ${input.source.sourceKind} source ${input.source.label}.`,
      details: {
        ...createLogDetails({
          source: input.source,
          pageUrl: input.source.sourceKey,
          extractorId: 'generic-listing'
        }),
        errorMessage: scopeError,
        scopeReason: scopeDecision.reason,
        targetHost: scopeDecision.host,
        authorizedAllowlist: scopeDecision.allowlist,
        strictScopeMode: scopeDecision.strict
      }
    });

    return input.runsRepository.markFinished({
      id: input.run.id,
      status: 'failed',
      jobCount: 0,
      newJobCount: 0,
      updatedJobCount: 0,
      errorMessage: scopeError
    });
  }

  const browser = await (input.createBrowser ?? createDiscoveryBrowser)();
  const context = await browser.newContext({
    locale: 'en-US'
  });
  const artifactIds: string[] = [];
  const currentPageUrlRef = {
    value: input.source.sourceKey
  };
  let counts = {
    jobCount: 0,
    newJobCount: 0,
    updatedJobCount: 0
  };
  let errorMessage: string | null = null;

  await context.tracing.start({
    screenshots: true,
    snapshots: true
  });

  await input.runsRepository.markRunning(input.run.id);
  await logRunEvent(input.logEventsRepository, {
    runId: input.run.id,
    level: 'info',
    message: 'Started discovery run.',
    details: {
      runKind: input.run.runKind,
      triggerKind: input.run.triggerKind,
      sourceCount: 1
    }
  });
  await logRunEvent(input.logEventsRepository, {
    runId: input.run.id,
    level: 'info',
    message: `Starting ${input.source.sourceKind} source ${input.source.label}.`,
    details: createLogDetails({
      source: input.source,
      pageUrl: input.source.sourceKey,
      extractorId: 'generic-listing'
    })
  });

  try {
    const jobs = await collectJobs({
      context,
      source: input.source,
      artifactsRepository: input.artifactsRepository,
      artifactsRootDir: input.artifactsRootDir,
      runId: input.run.id,
      currentPageUrlRef,
      artifactIds
    });

    counts = await ingestJobsIntoRun({
      runId: input.run.id,
      adapter: createPlaywrightSourceAdapter(input.source),
      jobs,
      jobsRepository: input.jobsRepository,
      ...(input.capturedAt !== undefined ? { capturedAt: input.capturedAt } : {})
    });
  } catch (error) {
    errorMessage = error instanceof Error ? error.message : 'Unknown Playwright discovery error.';
  }

  try {
    const tracePath = join(
      input.artifactsRootDir,
      'discovery-runs',
      input.run.id,
      `${sanitizeFileName(input.source.label)}-trace.zip`
    );
    await mkdir(join(input.artifactsRootDir, 'discovery-runs', input.run.id), {
      recursive: true
    });
    await context.tracing.stop({
      path: tracePath
    });

    const traceArtifact = await input.artifactsRepository.create({
      jobId: null,
      discoveryRunId: input.run.id,
      kind: 'fallback-trace',
      format: 'zip',
      fileName: basename(tracePath),
      storagePath: tracePath,
      createdAt: new Date()
    });
    artifactIds.push(traceArtifact.id);
  } finally {
    try {
      await browser.close();
    } catch (error) {
      if (!errorMessage) {
        errorMessage = error instanceof Error ? error.message : 'Failed to close Playwright browser.';
      }
    }
  }

  if (errorMessage) {
    await logRunEvent(input.logEventsRepository, {
      runId: input.run.id,
      level: 'error',
      message: `Failed ${input.source.sourceKind} source ${input.source.label}.`,
      details: createLogDetails({
        source: input.source,
        pageUrl: currentPageUrlRef.value,
        extractorId: 'generic-listing',
        artifactIds,
        errorMessage
      })
    });

    const failedRun = await input.runsRepository.markFinished({
      id: input.run.id,
      status: 'failed',
      jobCount: counts.jobCount,
      newJobCount: counts.newJobCount,
      updatedJobCount: counts.updatedJobCount,
      errorMessage
    });

    await logRunEvent(input.logEventsRepository, {
      runId: input.run.id,
      level: 'warn',
      message: 'Completed discovery run with source failures.',
      details: {
        jobCount: counts.jobCount,
        newJobCount: counts.newJobCount,
        updatedJobCount: counts.updatedJobCount,
        failureCount: 1
      }
    });

    return failedRun;
  }

  await logRunEvent(input.logEventsRepository, {
    runId: input.run.id,
    level: 'info',
    message: `Completed ${input.source.sourceKind} source ${input.source.label}.`,
    details: {
      ...createLogDetails({
        source: input.source,
        pageUrl: input.source.sourceKey,
        extractorId: 'generic-listing',
        artifactIds
      }),
      jobCount: counts.jobCount,
      newJobCount: counts.newJobCount,
      updatedJobCount: counts.updatedJobCount
    }
  });

  const completedRun = await input.runsRepository.markFinished({
    id: input.run.id,
    status: 'completed',
    jobCount: counts.jobCount,
    newJobCount: counts.newJobCount,
    updatedJobCount: counts.updatedJobCount
  });

  await logRunEvent(input.logEventsRepository, {
    runId: input.run.id,
    level: 'info',
    message: 'Completed discovery run.',
    details: {
      jobCount: counts.jobCount,
      newJobCount: counts.newJobCount,
      updatedJobCount: counts.updatedJobCount,
      failureCount: 0
    }
  });

  return completedRun;
}
