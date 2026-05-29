import type { Browser, BrowserContext, Page } from 'playwright';

import type { ApplicantProfile } from '@jobautomation/core';
import type { ApplicationRunRecord } from '@jobautomation/core';
import type { ArtifactRecord } from '@jobautomation/core';
import type { JobRecord } from '@jobautomation/core';
import type { OpenRouterConfig } from '@jobautomation/llm';

import type { ApplicationBrowserRuntime, BrowserIdentityConfig } from '../playwright/browser';
import type { SupportedApplicationBoard } from './board-entry';

export type ApplicationRunRecordLike = ApplicationRunRecord;

export type ApplicationArtifacts = {
  resume: ArtifactRecord | null;
  coverLetter: ArtifactRecord | null;
};

export type InteractionPacingProfile = {
  preFieldDelayMs?: [number, number];
  postFieldDelayMs?: [number, number];
  typingDelayMs?: [number, number];
  preApplyReadDelayMs?: [number, number];
  sectionReadDelayMs?: [number, number];
};

export type ApplicationChallengeSignal = {
  kind:
    | 'challenge_detected'
    | 'email_verification_required'
    | 'captcha_detected'
    | 'cloudflare_interstitial_detected';
  phase: string;
  message: string;
  url: string;
  selectors?: string[];
};

export type ApplicationSessionOptions = {
  runId: string;
  artifactsRootDir: string;
  startUrl?: string;
  identity: BrowserIdentityConfig;
  pacing?: InteractionPacingProfile;
};

export type ApplicationSession = {
  browser: Browser | null;
  context: BrowserContext;
  page: Page;
  identity: BrowserIdentityConfig;
  pacing?: InteractionPacingProfile;
  close: () => Promise<void>;
  closeSurplusBlankPages: () => Promise<void>;
  finalizeTrace: () => Promise<string>;
};

export type ApplicationSessionRuntime = ApplicationBrowserRuntime;

export type ApplicationSiteFlowContext = {
  applicantProfile: ApplicantProfile | null;
  artifacts: ApplicationArtifacts;
  job: JobRecord;
  run: ApplicationRunRecordLike;
  session: ApplicationSession;
  submissionMode?: 'submit' | 'stop_before_submit';
  openRouter?: OpenRouterConfig | null;
  logStep: (step: string, message: string, details?: Record<string, unknown>) => Promise<void>;
  captureScreenshot: (input: {
    step: string;
    message: string;
    details?: Record<string, unknown>;
  }) => Promise<{ artifactId: string; storagePath: string }>;
  completeRun: (input: {
    step: string;
    message: string;
    reviewUrl?: string | null;
    details?: Record<string, unknown>;
  }) => Promise<ApplicationRunRecordLike>;
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
  siteKey: SupportedApplicationBoard;
  supports: (job: JobRecord) => boolean;
  run: (context: ApplicationSiteFlowContext) => Promise<ApplicationRunRecordLike>;
};
