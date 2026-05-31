import { afterEach, describe, expect, test, vi } from 'vitest';

import type { ApplicantProfile } from '../../../packages/core/src/applicant-profile';
import { minimalAutofillProfileSchema } from '../../../packages/core/src/autofill-profile';
import type { ArtifactRecord } from '../../../packages/core/src/artifact';
import type { JobRecord } from '../../../packages/core/src/job';
import { runApplication } from '../../../packages/automation/src/apply/application-runner';

const baseJob = (overrides: Partial<JobRecord> = {}): JobRecord => ({
  id: 'job-1',
  sourceKind: 'greenhouse',
  sourceId: 'greenhouse-1',
  sourceUrl: 'https://job-boards.greenhouse.io/example/jobs/1',
  companyName: 'Example Corp',
  title: 'Platform Engineer',
  location: 'Toronto, ON',
  remoteType: 'hybrid',
  employmentType: 'full-time',
  compensationText: null,
  descriptionText: 'Build reliable automation systems.',
  rawPayload: null,
  discoveryRunId: null,
  status: 'shortlisted',
  reviewNotes: '',
  reviewSummary: null,
  reviewScore: null,
  reviewScoreReasoning: null,
  reviewUpdatedAt: null,
  reviewScoreUpdatedAt: null,
  prefilterPass: null,
  prefilterScore: null,
  prefilterReasonsJson: null,
  prefilterSignalsJson: null,
  discoveredAt: new Date('2026-03-13T10:00:00.000Z'),
  updatedAt: new Date('2026-03-13T10:00:00.000Z'),
  ...overrides
});

const baseApplicant = (overrides: Partial<ApplicantProfile> = {}): ApplicantProfile => ({
  id: 'default',
  fullName: 'Taylor Example',
  email: 'taylor@example.com',
  phone: '555-0100',
  location: 'Toronto, ON',
  summary: 'TypeScript engineer',
  reusableContext: 'Prefers local-first tooling.',
  linkedinUrl: 'https://www.linkedin.com/in/taylor-example',
  websiteUrl: 'https://example.com',
  baseResumeFileName: 'resume.tex',
  baseResumeTex: '\\section{Experience}',
  preferredCountries: ['CA'],
  jobKeywordProfile: {
    seniority: 'mid',
    target_titles: ['Platform Engineer'],
    positive_keywords: ['TypeScript'],
    negative_keywords: ['Sales']
  },
  jobKeywordProfileGeneratedAt: new Date('2026-03-13T09:00:00.000Z'),
  autofillProfile: minimalAutofillProfileSchema.parse({}),
  updatedAt: new Date('2026-03-13T09:00:00.000Z'),
  ...overrides
});

const baseArtifact = (overrides: Partial<ArtifactRecord> = {}): ArtifactRecord => ({
  id: 'artifact-1',
  jobId: 'job-1',
  discoveryRunId: null,
  applicantProfileId: 'default',
  applicantProfileUpdatedAt: new Date('2026-03-13T09:00:00.000Z'),
  version: 1,
  kind: 'resume-variant',
  format: 'pdf',
  fileName: 'resume.pdf',
  storagePath: 'C:/tmp/resume.pdf',
  createdAt: new Date('2026-03-13T10:05:00.000Z'),
  ...overrides
});

describe('application runner', () => {
  afterEach(() => {
    delete process.env.JOBAUTOMATION_AUTHORIZED_DOMAIN_ALLOWLIST;
    delete process.env.JOBAUTOMATION_AUTHORIZED_DOMAIN_STRICT;
    delete process.env.JOBAUTOMATION_APPLICATION_AUTO_CLOSE_BROWSER;
    delete process.env.JOBAUTOMATION_APPLICATION_POST_COMPLETION_CHECK_DELAY_MS;
  });

  test('skips application runs when target URL is outside the authorized domain allowlist', async () => {
    process.env.JOBAUTOMATION_AUTHORIZED_DOMAIN_ALLOWLIST = 'allowed.example.com';

    const job = baseJob({
      sourceUrl: 'https://job-boards.greenhouse.io/example/jobs/1'
    });
    const applicantProfile = baseApplicant({
      summary: '',
      reusableContext: '',
      baseResumeTex: '',
      jobKeywordProfile: null,
      jobKeywordProfileGeneratedAt: null
    });
    const browserFactory = vi.fn();
    const siteFlowRun = vi.fn();

    const result = await runApplication({
      jobId: job.id,
      jobsRepository: {
        findById: vi.fn().mockResolvedValue(job)
      },
      applicantProfileRepository: {
        get: vi.fn().mockResolvedValue(applicantProfile)
      },
      applicationRunsRepository: {
        create: vi.fn().mockImplementation(async (input) => ({
          id: 'run-allowlist',
          jobId: input.jobId,
          siteKey: input.siteKey,
          status: input.status,
          currentStep: input.currentStep,
          stopReason: input.stopReason ?? null,
          prefilterReasons: input.prefilterReasons ?? [],
          reviewUrl: null,
          resumeArtifactId: null,
          coverLetterArtifactId: null,
          createdAt: new Date('2026-03-13T10:10:00.000Z'),
          startedAt: null,
          completedAt: null,
          updatedAt: new Date('2026-03-13T10:10:00.000Z')
        })),
        update: vi.fn().mockImplementation(async (_id, patch) => ({
          id: 'run-allowlist',
          jobId: job.id,
          siteKey: 'greenhouse',
          status: patch.status ?? 'pending',
          currentStep: patch.currentStep ?? 'queued',
          stopReason: patch.stopReason ?? null,
          prefilterReasons: patch.prefilterReasons ?? [],
          reviewUrl: patch.reviewUrl ?? null,
          resumeArtifactId: null,
          coverLetterArtifactId: null,
          createdAt: new Date('2026-03-13T10:10:00.000Z'),
          startedAt: null,
          completedAt: new Date('2026-03-13T10:11:00.000Z'),
          updatedAt: new Date('2026-03-13T10:11:00.000Z')
        }))
      },
      artifactsRepository: {
        listByJobAndKind: vi.fn().mockResolvedValue([]),
        findById: vi.fn()
      },
      logEventsRepository: {
        create: vi.fn().mockResolvedValue(undefined)
      },
      siteFlows: [
        {
          siteKey: 'greenhouse',
          supports: vi.fn().mockReturnValue(true),
          run: siteFlowRun
        }
      ],
      createBrowser: browserFactory
    });

    expect(result.status).toBe('skipped');
    expect(result.currentStep).toBe('scope_denied');
    expect(result.stopReason).toBe('domain_not_authorized');
    expect(browserFactory).not.toHaveBeenCalled();
    expect(siteFlowRun).not.toHaveBeenCalled();

  });

  test('skips prefiltered jobs before creating a browser session', async () => {
    const job = baseJob({
      title: 'Senior Sales Manager',
      descriptionText: 'Lead sales organization with 10+ years of experience.'
    });
    const applicantProfile = baseApplicant();
    const browserFactory = vi.fn();
    const siteFlowRun = vi.fn();

    const result = await runApplication({
      jobId: job.id,
      jobsRepository: {
        findById: vi.fn().mockResolvedValue(job)
      },
      applicantProfileRepository: {
        get: vi.fn().mockResolvedValue(applicantProfile)
      },
      applicationRunsRepository: {
        create: vi.fn().mockImplementation(async (input) => ({
          id: 'run-1',
          jobId: input.jobId,
          siteKey: input.siteKey,
          status: input.status,
          currentStep: input.currentStep,
          stopReason: input.stopReason ?? null,
          prefilterReasons: input.prefilterReasons ?? [],
          reviewUrl: null,
          resumeArtifactId: null,
          coverLetterArtifactId: null,
          createdAt: new Date('2026-03-13T10:10:00.000Z'),
          startedAt: null,
          completedAt: null,
          updatedAt: new Date('2026-03-13T10:10:00.000Z')
        })),
        update: vi.fn().mockImplementation(async (_id, patch) => ({
          id: 'run-1',
          jobId: job.id,
          siteKey: 'greenhouse',
          status: patch.status ?? 'pending',
          currentStep: patch.currentStep ?? 'queued',
          stopReason: patch.stopReason ?? null,
          prefilterReasons: patch.prefilterReasons ?? [],
          reviewUrl: patch.reviewUrl ?? null,
          resumeArtifactId: null,
          coverLetterArtifactId: null,
          createdAt: new Date('2026-03-13T10:10:00.000Z'),
          startedAt: null,
          completedAt: new Date('2026-03-13T10:11:00.000Z'),
          updatedAt: new Date('2026-03-13T10:11:00.000Z')
        }))
      },
      artifactsRepository: {
        listByJobAndKind: vi.fn().mockResolvedValue([]),
        findById: vi.fn()
      },
      logEventsRepository: {
        create: vi.fn().mockResolvedValue(undefined)
      },
      siteFlows: [
        {
          siteKey: 'greenhouse',
          supports: vi.fn().mockReturnValue(true),
          run: siteFlowRun
        }
      ],
      createBrowser: browserFactory
    });

    expect(result.status).toBe('skipped');
    expect(result.prefilterReasons).toEqual([
      'title_negative',
      'role_family_mismatch'
    ]);
    expect(browserFactory).not.toHaveBeenCalled();
    expect(siteFlowRun).not.toHaveBeenCalled();
  });

  test('resumes from the persisted checkpoint and reuses stored artifacts', async () => {
    const job = baseJob();
    const applicantProfile = baseApplicant();
    const resumeArtifact = baseArtifact();
    const coverLetterArtifact = baseArtifact({
      id: 'artifact-2',
      kind: 'cover-letter',
      fileName: 'cover-letter.pdf',
      storagePath: 'C:/tmp/cover-letter.pdf'
    });
    const sessionClose = vi.fn().mockResolvedValue(undefined);
    const closeSurplusBlankPages = vi.fn().mockResolvedValue(undefined);
    const siteFlowRun = vi.fn().mockResolvedValue({
      id: 'run-2',
      jobId: job.id,
      siteKey: 'greenhouse',
      status: 'paused',
      currentStep: 'review_ready',
      stopReason: 'manual_review_required',
      prefilterReasons: [],
      reviewUrl: 'https://job-boards.greenhouse.io/example/jobs/1/application',
      resumeArtifactId: resumeArtifact.id,
      coverLetterArtifactId: coverLetterArtifact.id,
      createdAt: new Date('2026-03-13T10:10:00.000Z'),
      startedAt: new Date('2026-03-13T10:10:05.000Z'),
      completedAt: new Date('2026-03-13T10:11:00.000Z'),
      updatedAt: new Date('2026-03-13T10:11:00.000Z')
    });

    await runApplication({
      jobId: job.id,
      runId: 'run-2',
      jobsRepository: {
        findById: vi.fn().mockResolvedValue(job)
      },
      applicantProfileRepository: {
        get: vi.fn().mockResolvedValue(applicantProfile)
      },
      applicationRunsRepository: {
        findById: vi.fn().mockResolvedValue({
          id: 'run-2',
          jobId: job.id,
          siteKey: 'greenhouse',
          status: 'failed',
          currentStep: 'documents_resolved',
          stopReason: null,
          prefilterReasons: [],
          reviewUrl: null,
          resumeArtifactId: resumeArtifact.id,
          coverLetterArtifactId: coverLetterArtifact.id,
          createdAt: new Date('2026-03-13T10:10:00.000Z'),
          startedAt: new Date('2026-03-13T10:10:05.000Z'),
          completedAt: new Date('2026-03-13T10:10:45.000Z'),
          updatedAt: new Date('2026-03-13T10:10:45.000Z')
        }),
        create: vi.fn(),
        update: vi.fn().mockImplementation(async (_id, patch) => ({
          id: 'run-2',
          jobId: job.id,
          siteKey: 'greenhouse',
          status: patch.status ?? 'running',
          currentStep: patch.currentStep ?? 'documents_resolved',
          stopReason: patch.stopReason ?? null,
          prefilterReasons: patch.prefilterReasons ?? [],
          reviewUrl: patch.reviewUrl ?? null,
          resumeArtifactId: patch.resumeArtifactId ?? resumeArtifact.id,
          coverLetterArtifactId: patch.coverLetterArtifactId ?? coverLetterArtifact.id,
          createdAt: new Date('2026-03-13T10:10:00.000Z'),
          startedAt: patch.startedAt ?? new Date('2026-03-13T10:10:05.000Z'),
          completedAt: patch.completedAt ?? null,
          updatedAt: new Date('2026-03-13T10:10:45.000Z')
        }))
      },
      artifactsRepository: {
        listByJobAndKind: vi.fn().mockResolvedValue([]),
        findById: vi
          .fn()
          .mockResolvedValueOnce(resumeArtifact)
          .mockResolvedValueOnce(coverLetterArtifact)
      },
      logEventsRepository: {
        create: vi.fn().mockResolvedValue(undefined)
      },
      siteFlows: [
        {
          siteKey: 'greenhouse',
          supports: vi.fn().mockReturnValue(true),
          run: siteFlowRun
        }
      ],
      createBrowser: vi.fn().mockResolvedValue({
        browser: null,
        context: null,
        identity: {
          profileKind: 'apply',
          board: 'greenhouse',
          userDataDir: 'C:/profiles/apply/greenhouse',
          os: 'windows',
          locale: 'en-CA',
          enableCache: true,
          humanize: true,
          firefoxUserPrefs: {},
          headless: false
        },
        persistent: true,
        close: vi.fn().mockResolvedValue(undefined)
      }),
      createSession: vi.fn().mockResolvedValue({
        browser: {},
        context: {
          tracing: {
            stop: vi.fn().mockResolvedValue(undefined)
          }
        },
        identity: {
          profileKind: 'apply',
          board: 'greenhouse',
          userDataDir: 'C:/profiles/apply/greenhouse',
          os: 'windows',
          locale: 'en-CA',
          enableCache: true,
          humanize: true,
          firefoxUserPrefs: {},
          headless: false
        },
        page: {
          url: vi
            .fn()
            .mockReturnValue('https://job-boards.greenhouse.io/example/jobs/1/application')
        },
        finalizeTrace: vi.fn().mockResolvedValue('C:/tmp/trace.zip'),
        close: sessionClose,
        closeSurplusBlankPages
      })
    });

    expect(siteFlowRun).toHaveBeenCalledTimes(1);
    expect(siteFlowRun.mock.calls[0]?.[0]).toMatchObject({
      run: expect.objectContaining({
        id: 'run-2',
        currentStep: 'documents_resolved'
      }),
      artifacts: {
        resume: expect.objectContaining({ id: resumeArtifact.id }),
        coverLetter: expect.objectContaining({ id: coverLetterArtifact.id })
      }
    });

    expect(sessionClose).not.toHaveBeenCalled();
    expect(closeSurplusBlankPages).toHaveBeenCalledTimes(1);
  });

  test('closes a paused headed browser when auto-close is explicitly enabled', async () => {
    process.env.JOBAUTOMATION_APPLICATION_AUTO_CLOSE_BROWSER = '1';

    const job = baseJob();
    const applicantProfile = baseApplicant();
    const sessionClose = vi.fn().mockResolvedValue(undefined);
    const siteFlowRun = vi.fn().mockResolvedValue({
      id: 'run-autopilot',
      jobId: job.id,
      siteKey: 'greenhouse',
      status: 'paused',
      currentStep: 'fill_plan_required_fields_missing',
      stopReason: 'manual_review_required',
      prefilterReasons: [],
      reviewUrl: 'https://job-boards.greenhouse.io/example/jobs/1/application',
      resumeArtifactId: null,
      coverLetterArtifactId: null,
      createdAt: new Date('2026-03-13T10:10:00.000Z'),
      startedAt: new Date('2026-03-13T10:10:05.000Z'),
      completedAt: new Date('2026-03-13T10:11:00.000Z'),
      updatedAt: new Date('2026-03-13T10:11:00.000Z')
    });

    await runApplication({
      jobId: job.id,
      jobsRepository: {
        findById: vi.fn().mockResolvedValue(job)
      },
      applicantProfileRepository: {
        get: vi.fn().mockResolvedValue(applicantProfile)
      },
      applicationRunsRepository: {
        create: vi.fn().mockImplementation(async (input) => ({
          id: 'run-autopilot',
          jobId: input.jobId,
          siteKey: input.siteKey,
          status: input.status,
          currentStep: input.currentStep,
          stopReason: input.stopReason ?? null,
          prefilterReasons: input.prefilterReasons ?? [],
          reviewUrl: null,
          resumeArtifactId: null,
          coverLetterArtifactId: null,
          createdAt: new Date('2026-03-13T10:10:00.000Z'),
          startedAt: null,
          completedAt: null,
          updatedAt: new Date('2026-03-13T10:10:00.000Z')
        })),
        update: vi.fn().mockImplementation(async (_id, patch) => ({
          id: 'run-autopilot',
          jobId: job.id,
          siteKey: 'greenhouse',
          status: patch.status ?? 'running',
          currentStep: patch.currentStep ?? 'starting',
          stopReason: patch.stopReason ?? null,
          prefilterReasons: patch.prefilterReasons ?? [],
          reviewUrl: patch.reviewUrl ?? null,
          resumeArtifactId: patch.resumeArtifactId ?? null,
          coverLetterArtifactId: patch.coverLetterArtifactId ?? null,
          createdAt: new Date('2026-03-13T10:10:00.000Z'),
          startedAt: patch.startedAt ?? new Date('2026-03-13T10:10:05.000Z'),
          completedAt: patch.completedAt ?? null,
          updatedAt: new Date('2026-03-13T10:10:45.000Z')
        }))
      },
      artifactsRepository: {
        listByJobAndKind: vi.fn().mockResolvedValue([]),
        findById: vi.fn()
      },
      logEventsRepository: {
        create: vi.fn().mockResolvedValue(undefined)
      },
      siteFlows: [
        {
          siteKey: 'greenhouse',
          supports: vi.fn().mockReturnValue(true),
          run: siteFlowRun
        }
      ],
      createBrowser: vi.fn().mockResolvedValue({
        browser: null,
        context: null,
        identity: {
          profileKind: 'apply',
          board: 'greenhouse',
          userDataDir: 'C:/profiles/apply/greenhouse',
          os: 'windows',
          locale: 'en-CA',
          enableCache: true,
          humanize: true,
          firefoxUserPrefs: {},
          headless: false
        },
        persistent: true,
        close: vi.fn().mockResolvedValue(undefined)
      }),
      createSession: vi.fn().mockResolvedValue({
        browser: {},
        context: {
          tracing: {
            stop: vi.fn().mockResolvedValue(undefined)
          }
        },
        identity: {
          profileKind: 'apply',
          board: 'greenhouse',
          userDataDir: 'C:/profiles/apply/greenhouse',
          os: 'windows',
          locale: 'en-CA',
          enableCache: true,
          humanize: true,
          firefoxUserPrefs: {},
          headless: false
        },
        page: {
          url: vi
            .fn()
            .mockReturnValue('https://job-boards.greenhouse.io/example/jobs/1/application')
        },
        finalizeTrace: vi.fn().mockResolvedValue('C:/tmp/trace.zip'),
        close: sessionClose,
        closeSurplusBlankPages: vi.fn().mockResolvedValue(undefined)
      })
    });

    expect(sessionClose).toHaveBeenCalledTimes(1);
  });

  test('reopens a completed run as paused when post-completion validation errors remain visible', async () => {
    process.env.JOBAUTOMATION_APPLICATION_POST_COMPLETION_CHECK_DELAY_MS = '1';

    const job = baseJob();
    const applicantProfile = baseApplicant();
    const updates: Array<Record<string, unknown>> = [];
    const sessionClose = vi.fn().mockResolvedValue(undefined);
    const siteFlowRun = vi.fn().mockResolvedValue({
      id: 'run-post-check',
      jobId: job.id,
      siteKey: 'greenhouse',
      status: 'completed',
      currentStep: 'submitted',
      stopReason: null,
      prefilterReasons: [],
      reviewUrl: 'https://job-boards.greenhouse.io/example/jobs/1/application',
      resumeArtifactId: null,
      coverLetterArtifactId: null,
      createdAt: new Date('2026-03-13T10:10:00.000Z'),
      startedAt: new Date('2026-03-13T10:10:05.000Z'),
      completedAt: new Date('2026-03-13T10:11:00.000Z'),
      updatedAt: new Date('2026-03-13T10:11:00.000Z')
    });
    const visibleLocator = {
      first: () => ({
        isVisible: vi.fn().mockResolvedValue(true)
      })
    };
    const hiddenLocator = {
      first: () => ({
        isVisible: vi.fn().mockResolvedValue(false)
      })
    };

    const result = await runApplication({
      jobId: job.id,
      jobsRepository: {
        findById: vi.fn().mockResolvedValue(job)
      },
      applicantProfileRepository: {
        get: vi.fn().mockResolvedValue(applicantProfile)
      },
      applicationRunsRepository: {
        create: vi.fn().mockImplementation(async (input) => ({
          id: 'run-post-check',
          jobId: input.jobId,
          siteKey: input.siteKey,
          status: input.status,
          currentStep: input.currentStep,
          stopReason: input.stopReason ?? null,
          prefilterReasons: input.prefilterReasons ?? [],
          reviewUrl: null,
          resumeArtifactId: null,
          coverLetterArtifactId: null,
          createdAt: new Date('2026-03-13T10:10:00.000Z'),
          startedAt: null,
          completedAt: null,
          updatedAt: new Date('2026-03-13T10:10:00.000Z')
        })),
        update: vi.fn().mockImplementation(async (_id, patch) => {
          updates.push(patch);
          return {
            id: 'run-post-check',
            jobId: job.id,
            siteKey: 'greenhouse',
            status: patch.status ?? 'running',
            currentStep: patch.currentStep ?? 'starting',
            stopReason: patch.stopReason ?? null,
            prefilterReasons: patch.prefilterReasons ?? [],
            reviewUrl: patch.reviewUrl ?? null,
            resumeArtifactId: patch.resumeArtifactId ?? null,
            coverLetterArtifactId: patch.coverLetterArtifactId ?? null,
            createdAt: new Date('2026-03-13T10:10:00.000Z'),
            startedAt: patch.startedAt ?? new Date('2026-03-13T10:10:05.000Z'),
            completedAt: patch.completedAt ?? null,
            updatedAt: patch.updatedAt ?? new Date('2026-03-13T10:10:45.000Z')
          };
        })
      },
      artifactsRepository: {
        listByJobAndKind: vi.fn().mockResolvedValue([]),
        findById: vi.fn()
      },
      logEventsRepository: {
        create: vi.fn().mockResolvedValue(undefined)
      },
      siteFlows: [
        {
          siteKey: 'greenhouse',
          supports: vi.fn().mockReturnValue(true),
          run: siteFlowRun
        }
      ],
      createBrowser: vi.fn().mockResolvedValue({
        browser: null,
        context: null,
        identity: {
          profileKind: 'apply',
          board: 'greenhouse',
          userDataDir: 'C:/profiles/apply/greenhouse',
          os: 'windows',
          locale: 'en-CA',
          enableCache: true,
          humanize: true,
          firefoxUserPrefs: {},
          headless: false
        },
        persistent: true,
        close: vi.fn().mockResolvedValue(undefined)
      }),
      createSession: vi.fn().mockResolvedValue({
        browser: {},
        context: {
          tracing: {
            stop: vi.fn().mockResolvedValue(undefined)
          }
        },
        identity: {
          profileKind: 'apply',
          board: 'greenhouse',
          userDataDir: 'C:/profiles/apply/greenhouse',
          os: 'windows',
          locale: 'en-CA',
          enableCache: true,
          humanize: true,
          firefoxUserPrefs: {},
          headless: false
        },
        page: {
          isClosed: vi.fn().mockReturnValue(false),
          waitForTimeout: vi.fn().mockResolvedValue(undefined),
          url: vi.fn().mockReturnValue('https://job-boards.greenhouse.io/example/jobs/1/application'),
          getByText: vi.fn().mockReturnValue(hiddenLocator),
          locator: vi.fn().mockImplementation((selector: string) =>
            selector === ':invalid' ? visibleLocator : hiddenLocator
          )
        },
        finalizeTrace: vi.fn().mockResolvedValue('C:/tmp/trace.zip'),
        close: sessionClose,
        closeSurplusBlankPages: vi.fn().mockResolvedValue(undefined)
      })
    });

    expect(result.status).toBe('paused');
    expect(result.currentStep).toBe('post_completion_safeguard');
    expect(result.stopReason).toBe('post_completion_validation_error');
    expect(updates.some((patch) => patch.status === 'paused')).toBe(true);
    expect(sessionClose).not.toHaveBeenCalled();
  });
});
