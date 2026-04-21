import { mkdir, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';

import type { Page } from 'playwright';

import type { ApplicationRunRecordLike } from './contracts';

function sanitizeSegment(value: string): string {
  return value.replace(/[^a-z0-9._-]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase();
}

export async function pauseApplicationRun(input: {
  run: ApplicationRunRecordLike;
  page: Pick<Page, 'screenshot' | 'url'>;
  step: string;
  siteKey: string;
  message: string;
  stopReason?: string;
  details?: Record<string, unknown>;
  artifactsRootDir: string;
  applicationRunsRepository: {
    update: (
      id: string,
      patch: Partial<ApplicationRunRecordLike> & { prefilterReasons?: string[] }
    ) => Promise<ApplicationRunRecordLike>;
  };
  artifactsRepository: {
    create: (input: {
      jobId: string | null;
      discoveryRunId: string | null;
      applicationRunId?: string | null;
      kind: string;
      format: string;
      fileName: string;
      storagePath: string;
      createdAt: Date;
    }) => Promise<{ id: string; kind: string }>;
  };
  logEventsRepository: {
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
  finalizeTrace: (tracePath: string) => Promise<void>;
}): Promise<ApplicationRunRecordLike> {
  const directoryPath = join(input.artifactsRootDir, 'applications', input.run.id);
  await mkdir(directoryPath, { recursive: true });

  const filePrefix = `${sanitizeSegment(input.siteKey)}-${sanitizeSegment(input.step)}`;
  const screenshotPath = join(directoryPath, `${filePrefix}.png`);
  const tracePath = join(directoryPath, `${filePrefix}-trace.zip`);
  const detailsPath = join(directoryPath, `${filePrefix}.json`);
  const screenshot = await input.page.screenshot({ fullPage: true });
  await writeFile(screenshotPath, screenshot);
  await input.finalizeTrace(tracePath);

  const evidenceDetails = {
    applicationRunId: input.run.id,
    siteKey: input.siteKey,
    step: input.step,
    pageUrl: input.page.url(),
    ...(input.details ?? {})
  };

  if (input.details && Object.keys(input.details).length > 0) {
    await writeFile(detailsPath, `${JSON.stringify(evidenceDetails, null, 2)}\n`);
  }

  const screenshotArtifact = await input.artifactsRepository.create({
    jobId: input.run.jobId,
    discoveryRunId: null,
    applicationRunId: input.run.id,
    kind: 'application-screenshot',
    format: 'png',
    fileName: basename(screenshotPath),
    storagePath: screenshotPath,
    createdAt: new Date()
  });
  const traceArtifact = await input.artifactsRepository.create({
    jobId: input.run.jobId,
    discoveryRunId: null,
    applicationRunId: input.run.id,
    kind: 'application-trace',
    format: 'zip',
    fileName: basename(tracePath),
    storagePath: tracePath,
    createdAt: new Date()
  });
  const detailsArtifact =
    input.details && Object.keys(input.details).length > 0
      ? await input.artifactsRepository.create({
          jobId: input.run.jobId,
          discoveryRunId: null,
          applicationRunId: input.run.id,
          kind: 'application-evidence-json',
          format: 'json',
          fileName: basename(detailsPath),
          storagePath: detailsPath,
          createdAt: new Date()
        })
      : null;

  await input.logEventsRepository.create({
    applicationRunId: input.run.id,
    jobId: input.run.jobId,
    level: 'info',
    message: input.message,
    detailsJson: JSON.stringify({
      ...evidenceDetails,
      artifactId: screenshotArtifact.id,
      traceArtifactId: traceArtifact.id,
      ...(detailsArtifact ? { detailsArtifactId: detailsArtifact.id } : {}),
      ...(input.details ?? {})
    })
  });

  return input.applicationRunsRepository.update(input.run.id, {
    status: 'paused',
    currentStep: input.step,
    stopReason: input.stopReason ?? 'manual_review_required',
    reviewUrl: input.page.url(),
    completedAt: new Date(),
    updatedAt: new Date()
  });
}
