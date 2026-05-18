import { existsSync, readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'vitest';
import type { ApplicantProfile, ArtifactRecord, JobRecord } from '@jobautomation/core';
import { defaultMinimalAutofillProfile } from '../../../packages/core/src/autofill-profile';
import { createApplicationBrowserRuntime } from '../../../packages/automation/src/playwright/browser';
import { createApplicationSession } from '../../../packages/automation/src/apply/session-manager';
import type { SupportedApplicationBoard } from '../../../packages/automation/src/apply/board-entry';
import type {
  ApplicationRunRecordLike,
  ApplicationSiteFlowContext,
  SupportedApplicationSite,
} from '../../../packages/automation/src/apply/contracts';
import { greenhouseApplicationSite } from '../../../packages/automation/src/apply/sites/greenhouse-apply';
import { ashbyApplicationSite } from '../../../packages/automation/src/apply/sites/ashby-apply';
import { leverApplicationSite } from '../../../packages/automation/src/apply/sites/lever-apply';

loadRepoDotEnv();

const liveTestsEnabled = process.env.JOBAUTOMATION_LIVE_JOB_BOARD_TESTS === '1';
const liveDescribe = liveTestsEnabled ? describe : describe.skip;
const artifactsRootDir = fileURLToPath(
  new URL('../../../data/test-artifacts/live-job-board-tests', import.meta.url)
);

const boards = [
  {
    board: 'greenhouse',
    envKey: 'JOBAUTOMATION_LIVE_GREENHOUSE_JOB_URL',
    site: greenhouseApplicationSite,
  },
  {
    board: 'ashby',
    envKey: 'JOBAUTOMATION_LIVE_ASHBY_JOB_URL',
    site: ashbyApplicationSite,
  },
  {
    board: 'lever',
    envKey: 'JOBAUTOMATION_LIVE_LEVER_JOB_URL',
    site: leverApplicationSite,
  },
] as const;

liveDescribe('live job board application fill checks', () => {
  test.each(boards)(
    'fills required fields and stops before submit for $board',
    async ({ board, envKey, site }) => {
      const sourceUrl = requireEnv(envKey);
      const openRouter = {
        apiKey: requireEnv('OPENROUTER_API_KEY'),
        baseUrl: process.env.OPENROUTER_API_BASE_URL ?? 'https://openrouter.ai/api/v1',
        model: requireEnv('OPENROUTER_APPLICATION_FILL_PLAN_MODEL'),
      };
      const resumeArtifact = await createResumeArtifact(board);
      const runtime = await createApplicationBrowserRuntime({
        board,
        identity: {
          headless: process.env.JOBAUTOMATION_LIVE_JOB_BOARD_HEADED !== '1',
        },
      });
      const session = await createApplicationSession({
        runtime,
        runId: `live-${board}-${Date.now()}`,
        artifactsRootDir,
        startUrl: sourceUrl,
        identity: runtime.identity,
        pacing: {
          preApplyReadDelayMs: [50, 75],
          sectionReadDelayMs: [25, 40],
          preFieldDelayMs: [15, 25],
          postFieldDelayMs: [15, 25],
          typingDelayMs: [1, 3],
        },
      });

      try {
        const context = createLiveContext({
          board,
          sourceUrl,
          site,
          session,
          resumeArtifact,
          openRouter,
        });

        const result = await site.run(context);

        expect(result.status).toBe('paused');
        expect(result.currentStep).toBe('required_fields_filled');
      } finally {
        await session.finalizeTrace().catch(() => undefined);
        await session.close();
      }
    },
    360_000
  );
});

function requireEnv(key: string): string {
  const value = process.env[key]?.trim();
  if (!value) {
    throw new Error(`${key} must be set when JOBAUTOMATION_LIVE_JOB_BOARD_TESTS=1.`);
  }

  return value;
}

function loadRepoDotEnv(): void {
  const rootDir = fileURLToPath(new URL('../../../', import.meta.url));
  const envPath = join(rootDir, '.env');
  if (!existsSync(envPath)) {
    return;
  }

  const lines = readFileSync(envPath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex <= 0) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    if (process.env[key] !== undefined) {
      continue;
    }

    process.env[key] = parseDotEnvValue(trimmed.slice(separatorIndex + 1));
  }
}

function parseDotEnvValue(raw: string): string {
  const value = raw.trim();
  const quote = value[0];
  if ((quote === '"' || quote === "'") && value[value.length - 1] === quote) {
    return value.slice(1, -1);
  }

  return value;
}

async function createResumeArtifact(board: SupportedApplicationBoard): Promise<ArtifactRecord> {
  const directory = join(artifactsRootDir, 'fixtures');
  await mkdir(directory, { recursive: true });
  const storagePath = join(directory, `${board}-resume.pdf`);
  await writeFile(
    storagePath,
    Buffer.from(
      '%PDF-1.4\n1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n2 0 obj << /Type /Pages /Count 0 >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n',
      'utf8'
    )
  );

  return {
    id: `${board}-resume-artifact`,
    jobId: null,
    discoveryRunId: null,
    applicationRunId: null,
    applicantProfileId: 'default',
    applicantProfileUpdatedAt: new Date('2026-05-17T00:00:00.000Z'),
    version: 1,
    kind: 'resume-variant',
    format: 'pdf',
    fileName: `${board}-resume.pdf`,
    storagePath,
    createdAt: new Date('2026-05-17T00:00:00.000Z'),
  };
}

function createLiveContext(input: {
  board: SupportedApplicationBoard;
  sourceUrl: string;
  site: SupportedApplicationSite;
  session: ApplicationSiteFlowContext['session'];
  resumeArtifact: ArtifactRecord;
  openRouter: NonNullable<ApplicationSiteFlowContext['openRouter']>;
}): ApplicationSiteFlowContext {
  const run: ApplicationRunRecordLike = {
    id: `live-run-${input.board}`,
    jobId: `live-job-${input.board}`,
    autopilotRunId: null,
    siteKey: input.board,
    status: 'running',
    currentStep: 'starting',
    stopReason: null,
    reviewUrl: null,
    resumeArtifactId: input.resumeArtifact.id,
    coverLetterArtifactId: null,
    prefilterReasons: [],
    startedAt: new Date('2026-05-17T00:00:00.000Z'),
    completedAt: null,
    createdAt: new Date('2026-05-17T00:00:00.000Z'),
    updatedAt: new Date('2026-05-17T00:00:00.000Z'),
  };

  return {
    applicantProfile: createApplicantProfile(),
    artifacts: {
      resume: input.resumeArtifact,
      coverLetter: null,
    },
    job: createJobRecord(input.board, input.sourceUrl),
    run,
    session: input.session,
    submissionMode: 'stop_before_submit',
    openRouter: input.openRouter,
    logStep: async (step, message, details = {}) => {
      console.log(`[live-job-board:${input.board}] ${step}: ${message}`, details);
    },
    captureScreenshot: async () => ({
      artifactId: `${input.board}-screenshot`,
      storagePath: join(artifactsRootDir, `${input.board}-screenshot.png`),
    }),
    completeRun: async ({ step, details }) => {
      throw new Error(
        `Live ${input.board} test attempted to complete at ${step}: ${JSON.stringify(details)}`
      );
    },
    stopBeforeSubmit: async ({ step }) => ({
      ...run,
      status: 'paused',
      currentStep: step,
      stopReason: 'stop_before_submit',
      reviewUrl: input.session.page.url(),
      updatedAt: new Date(),
      completedAt: new Date(),
      prefilterReasons: [],
    } as ApplicationRunRecordLike),
    pauseForManualReview: async ({ step, message, details, stopReason }) => {
      throw new Error(
        `Live ${input.board} test paused at ${step} (${stopReason ?? 'no_stop_reason'}): ${message}\n${JSON.stringify(
          details,
          null,
          2
        )}`
      );
    },
  };
}

function createJobRecord(board: SupportedApplicationBoard, sourceUrl: string): JobRecord {
  return {
    id: `live-job-${board}`,
    sourceKind: board,
    sourceId: `live-${board}`,
    sourceUrl,
    companyName: 'Live Board Company',
    title: 'Live Board Role',
    location: 'Remote',
    remoteType: 'unknown',
    employmentType: null,
    compensationText: null,
    descriptionText: 'Live job board application smoke test.',
    rawPayload: null,
    discoveryRunId: null,
    status: 'discovered',
    reviewNotes: '',
    reviewSummary: null,
    reviewScore: null,
    reviewScoreReasoning: null,
    reviewUpdatedAt: null,
    reviewScoreUpdatedAt: null,
    discoveredAt: new Date('2026-05-17T00:00:00.000Z'),
    updatedAt: new Date('2026-05-17T00:00:00.000Z'),
    prefilterPass: null,
    prefilterScore: null,
    prefilterReasonsJson: null,
    prefilterSignalsJson: null,
  };
}

function createApplicantProfile(): ApplicantProfile {
  return {
    id: 'default',
    fullName: 'Taylor Example',
    email: 'taylor.example@example.com',
    phone: '5550100000',
    location: 'Toronto, ON',
    summary: 'Software engineer focused on automation, TypeScript, Node.js, and Playwright.',
    reusableContext:
      'Taylor builds browser automation, TypeScript services, reliable test suites, and dashboard workflows.',
    linkedinUrl: 'https://www.linkedin.com/in/taylor-example',
    websiteUrl: 'https://example.com',
    baseResumeFileName: 'resume.pdf',
    baseResumeTex:
      '\\section{Experience}\\n\\item Built TypeScript and Playwright automation for job application workflows.\\n\\item Developed Node.js services and React dashboards for operational tooling.',
    preferredCountries: ['CA', 'US'],
    jobKeywordProfile: null,
    jobKeywordProfileGeneratedAt: null,
    autofillProfile: {
      ...defaultMinimalAutofillProfile,
      workAuthorizationCountriesCsv: 'CA,US',
      requiresSponsorship: 'no',
      currentCountryCode: 'CA',
      primaryCitizenshipCountryCode: 'CA',
      legallyAuthorizedInCurrentCountry: 'yes',
      needsSponsorshipInCurrentCountry: 'no',
      acceptApplicationPrivacyNotices: 'yes',
      consentToDemographicDataProcessing: 'no',
      lgbtqiaCommunityIdentification: 'prefer_not_to_say',
      clearanceStatus: 'none',
      relocation: 'no',
      workPreference: 'remote',
      startDate: '2026-06-01',
      genderPronouns: 'prefer_not_to_say',
      raceEthnicity: 'prefer_not_to_say',
      veteranStatus: 'prefer_not_to_say',
      disabilityStatus: 'prefer_not_to_say',
      driversLicense: 'yes',
      willingToTravel: '25',
      yearsOfExperience: '3_5',
      highestEducation: 'bachelor',
      highestEducationSchool: 'Example University',
      highestEducationProgram: 'Computer Science',
      highestEducationDiscipline: 'Software Engineering',
      highestEducationStartYear: '2018',
      highestEducationEndYear: '2022',
      criminalBackground: 'disclose_if_required',
      noticePeriod: '2_weeks',
      currentlyEmployed: 'yes',
      salaryExpectations: 'Market rate',
      salaryExpectationAmount: '120000',
      salaryExpectationCurrency: 'USD',
      salaryExpectationPeriod: 'yearly',
      willingToWorkNightsWeekends: 'occasionally',
      certificationsLicenses: 'None',
      languagesSpoken: 'English',
      knowsSomeoneAtCompany: 'no',
    },
    emailVerification: {
      enabled: false,
      provider: 'gmail_oauth',
      gmailUserEmail: '',
      gmailClientId: '',
      gmailClientSecret: '',
      gmailRefreshToken: '',
    },
    updatedAt: new Date('2026-05-17T00:00:00.000Z'),
  };
}
