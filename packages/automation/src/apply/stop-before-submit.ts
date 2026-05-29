import type { Page } from 'playwright';

import type { ApplicationRunRecordLike } from './contracts';
import { pauseApplicationRun } from './pause-application-run';

export async function stopBeforeSubmit(input: {
  run: ApplicationRunRecordLike;
  page: Pick<Page, 'screenshot' | 'url'>;
  step: string;
  siteKey: string;
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
  return pauseApplicationRun({
    ...input,
    message: 'Paused before final submit.'
  });
}
