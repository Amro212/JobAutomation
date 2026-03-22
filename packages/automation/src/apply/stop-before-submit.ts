import { mkdir, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';

import type { Page } from 'playwright';

import type { ApplicationRunRecordLike } from './contracts';

function sanitizeSegment(value: string): string {
  return value.replace(/[^a-z0-9._-]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase();
}

export async function stopBeforeSubmit(input: {
  run: ApplicationRunRecordLike;
  page: Pick<Page, 'screenshot' | 'url'>;
  step: string;
  siteKey: string;
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
      discoveryRunId?: string | null;
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
  const screenshot = await input.page.screenshot({ fullPage: true });
  await writeFile(screenshotPath, screenshot);
  await input.finalizeTrace(tracePath);

  const screenshotArtifact = await input.artifactsRepository.create({
    jobId: input.run.jobId,
    applicationRunId: input.run.id,
    kind: 'application-screenshot',
    format: 'png',
    fileName: basename(screenshotPath),
    storagePath: screenshotPath,
    createdAt: new Date()
  });
  const traceArtifact = await input.artifactsRepository.create({
    jobId: input.run.jobId,
    applicationRunId: input.run.id,
    kind: 'application-trace',
    format: 'zip',
    fileName: basename(tracePath),
    storagePath: tracePath,
    createdAt: new Date()
  });

  await input.logEventsRepository.create({
    applicationRunId: input.run.id,
    jobId: input.run.jobId,
    level: 'info',
    message: 'Paused before final submit.',
    detailsJson: JSON.stringify({
      applicationRunId: input.run.id,
      siteKey: input.siteKey,
      step: input.step,
      pageUrl: input.page.url(),
      artifactId: screenshotArtifact.id,
      traceArtifactId: traceArtifact.id
    })
  });

  return input.applicationRunsRepository.update(input.run.id, {
    status: 'paused',
    currentStep: input.step,
    stopReason: 'manual_review_required',
    reviewUrl: input.page.url(),
    completedAt: new Date(),
    updatedAt: new Date()
  });
}
