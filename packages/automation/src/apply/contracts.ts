import type { Browser, BrowserContext, Page } from 'playwright';

import type { ApplicantProfile } from '@jobautomation/core';
import type { ApplicationRunRecord, ApplicationRunType } from '@jobautomation/core';
import type { ArtifactRecord } from '@jobautomation/core';
import type { JobRecord } from '@jobautomation/core';
import type { OpenRouterConfig } from '@jobautomation/llm';

export type ApplicationRunRecordLike = ApplicationRunRecord;

export type ApplicationArtifacts = {
  resume: ArtifactRecord | null;
  coverLetter: ArtifactRecord | null;
};

export type ApplicationSession = {
  browser: Browser;
  context: BrowserContext;
  page: Page;
  close: () => Promise<void>;
  finalizeTrace: () => Promise<string>;
};

export type ApplicationSiteFlowContext = {
  applicantProfile: ApplicantProfile | null;
  artifacts: ApplicationArtifacts;
  job: JobRecord;
  run: ApplicationRunRecordLike;
  session: ApplicationSession;
  openRouter?: OpenRouterConfig | null;
  logStep: (step: string, message: string, details?: Record<string, unknown>) => Promise<void>;
  captureScreenshot: (input: {
    step: string;
    message: string;
    details?: Record<string, unknown>;
  }) => Promise<{ artifactId: string; storagePath: string }>;
  stopBeforeSubmit: (input: {
    step: string;
    reviewUrl?: string | null;
    details?: Record<string, unknown>;
  }) => Promise<ApplicationRunRecordLike>;
  pauseForManualReview: (input: {
    step: string;
    message: string;
    reviewUrl?: string | null;
    details?: Record<string, unknown>;
    stopReason?: string;
  }) => Promise<ApplicationRunRecordLike>;
};

export type SupportedApplicationSite = {
  siteKey: ApplicationRunType;
  supports: (job: JobRecord) => boolean;
  run: (context: ApplicationSiteFlowContext) => Promise<ApplicationRunRecordLike>;
};
