import { beforeEach, describe, expect, test, vi } from 'vitest';

import { defaultMinimalAutofillProfile } from '../../../packages/core/src/autofill-profile';
import type { ApplicationSiteFlowContext } from '../../../packages/automation/src/apply/contracts';

const boardEntryBySite = {
  greenhouse: {
    board: 'greenhouse',
    entryAction: 'direct_form',
    startUrl: 'https://job-boards.greenhouse.io/example/jobs/1',
    finalUrl: 'https://job-boards.greenhouse.io/example/jobs/1',
    readyFieldCount: 1,
    rootSelector: '#application',
    rootIndex: 0,
  },
  ashby: {
    board: 'ashby',
    entryAction: 'clicked_application_tab',
    startUrl: 'https://jobs.ashbyhq.com/example/1',
    finalUrl: 'https://jobs.ashbyhq.com/example/1',
    readyFieldCount: 1,
    rootSelector: '[role="tabpanel"]',
    rootIndex: 0,
  },
  lever: {
    board: 'lever',
    entryAction: 'clicked_apply_button',
    startUrl: 'https://jobs.lever.co/example/1',
    finalUrl: 'https://jobs.lever.co/example/1',
    readyFieldCount: 1,
    rootSelector: '[data-qa="application-form"]',
    rootIndex: 0,
  },
} as const;

const scrapedFieldsBySite = {
  greenhouse: [
    {
      id: 'first_name',
      label: 'First Name',
      type: 'text',
      required: true,
      visible: true,
      enabled: true,
      selectorCandidates: ['#first_name'],
      options: [],
    },
  ],
  ashby: [
    {
      id: 'phone',
      label: 'Phone',
      type: 'tel',
      required: false,
      visible: true,
      enabled: true,
      selectorCandidates: ['#phone'],
      options: [],
    },
  ],
  lever: [
    {
      id: 'location',
      label: 'Location',
      type: 'text',
      required: true,
      visible: true,
      enabled: true,
      selectorCandidates: ['#location'],
      options: [],
    },
  ],
} as const;

const fillPlanBySite = {
  greenhouse: [
    {
      fieldId: 'first_name',
      action: 'fill',
      value: 'Taylor',
      confidence: 1,
      skipReason: '',
    },
  ],
  ashby: [
    {
      fieldId: 'phone',
      action: 'fill',
      value: '555-0100',
      confidence: 1,
      skipReason: '',
    },
  ],
  lever: [
    {
      fieldId: 'location',
      action: 'fill',
      value: 'Toronto',
      confidence: 1,
      skipReason: '',
    },
  ],
} as const;

describe('stage 5 site flow integration', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  test.each([
    {
      siteKey: 'greenhouse',
      modulePath:
        '../../../packages/automation/src/apply/sites/greenhouse-apply',
      exportName: 'greenhouseApplicationSite',
      title: 'Greenhouse',
    },
    {
      siteKey: 'ashby',
      modulePath: '../../../packages/automation/src/apply/sites/ashby-apply',
      exportName: 'ashbyApplicationSite',
      title: 'Ashby',
    },
    {
      siteKey: 'lever',
      modulePath: '../../../packages/automation/src/apply/sites/lever-apply',
      exportName: 'leverApplicationSite',
      title: 'Lever',
    },
  ])(
    'executes the generated fill plan only after trust warm-up for $title',
    async ({ siteKey, modulePath, exportName }) => {
      const boardEntry = boardEntryBySite[siteKey];
      const scrapedFields = scrapedFieldsBySite[siteKey];
      const fillPlan = fillPlanBySite[siteKey];
      const fieldDiagnostics = [
        {
          fieldId: scrapedFields[0].id,
          label: scrapedFields[0].label,
          type: scrapedFields[0].type,
          required: scrapedFields[0].required,
          answerability: 'direct_profile',
          category: 'accepted',
          rawAction: 'fill',
          normalizedAction: 'fill',
          expectedActions: ['fill'],
          reason: 'accepted',
          recovered: false,
        },
      ];
      const executionResult = {
        results: [
          {
            fieldId: scrapedFields[0].id,
            label: scrapedFields[0].label,
            action: 'fill',
            status: 'success',
            selector: scrapedFields[0].selectorCandidates[0],
            message: 'Filled field.',
          },
        ],
        summary: {
          total: 1,
          success: 1,
          skipped: 0,
          failed: 0,
        },
        telemetry: {
          totalPreFillDwellMs: 100,
          totalTypingDurationMs: 80,
          totalPointerActions: 2,
          forbiddenDirectApiUsage: [],
        },
      };

      const reachApplicationForm = vi.fn().mockResolvedValue(boardEntry);
      const scrapeApplicationFields = vi.fn().mockResolvedValue(scrapedFields);
      const generateApplicationFillPlan = vi.fn().mockResolvedValue({
        promptVersion: 'stage4-fill-plan-v1',
        rawResponseLength: 100,
        promptPayload: { fields: [] },
        responseJson: { items: fillPlan },
        fieldDiagnostics,
        fillPlan,
      });
      const executeApplicationFillPlan = vi
        .fn()
        .mockResolvedValue(executionResult);
      const warmApplicationPageBeforeEntry = vi.fn().mockResolvedValue({
        totalDwellMs: 1200,
      });
      const warmApplicationFormBeforeFill = vi.fn().mockResolvedValue({
        totalDwellMs: 900,
      });
      const detectApplicationChallenge = vi.fn().mockResolvedValue(null);

      vi.doMock('../../../packages/automation/src/apply/board-entry', () => ({
        reachApplicationForm,
      }));
      vi.doMock('../../../packages/automation/src/apply/form-scraper', () => ({
        scrapeApplicationFields,
      }));
      vi.doMock(
        '../../../packages/automation/src/apply/openrouter-answer-module',
        () => ({
          generateApplicationFillPlan,
        })
      );
      vi.doMock(
        '../../../packages/automation/src/apply/fill-plan-executor',
        () => ({
          executeApplicationFillPlan,
        })
      );
      vi.doMock('../../../packages/automation/src/apply/trust-runtime', () => ({
        warmApplicationPageBeforeEntry,
        warmApplicationFormBeforeFill,
        detectApplicationChallenge,
      }));

      const importedModule = await import(modulePath);
      const site = importedModule[
        exportName as keyof typeof importedModule
      ] as {
        run: (context: ApplicationSiteFlowContext) => Promise<unknown>;
      };
      const context = createContext({
        siteKey,
        finalUrl: boardEntry.finalUrl,
      });

      await site.run(context);

      expect(warmApplicationPageBeforeEntry).toHaveBeenCalledWith({
        page: context.session.page,
        board: siteKey,
        pacing: context.session.pacing,
      });
      expect(warmApplicationFormBeforeFill).toHaveBeenCalledWith({
        page: context.session.page,
        board: siteKey,
        boardEntry,
        pacing: context.session.pacing,
      });
      expect(executeApplicationFillPlan).toHaveBeenCalledWith({
        page: context.session.page,
        boardEntry,
        artifacts: context.artifacts,
        fields: scrapedFields,
        fillPlan,
        pacing: context.session.pacing,
      });
      expect(context.pauseForManualReview).toHaveBeenCalledWith({
        step: 'fill_plan_executed',
        message: expect.stringContaining('Paused after executing'),
        details: expect.objectContaining({
          boardEntry,
          scrapedFields,
          fillPlan,
          executionResult,
          preEntryWarmup: { totalDwellMs: 1200 },
          preFillWarmup: { totalDwellMs: 900 },
          profileDirectory: 'C:/profiles/apply/board',
        }),
      });
    }
  );

  test('pauses early when challenge detection trips before scraping', async () => {
    const boardEntry = boardEntryBySite.greenhouse;
    const challengeSignal = {
      kind: 'email_verification_required',
      phase: 'before_scrape',
      message:
        'Greenhouse requested email verification before form completion.',
      url: boardEntry.finalUrl,
      selectors: ['iframe[src*="recaptcha"]'],
    };
    const reachApplicationForm = vi.fn().mockResolvedValue(boardEntry);
    const scrapeApplicationFields = vi.fn();
    const executeApplicationFillPlan = vi.fn();
    const warmApplicationPageBeforeEntry = vi.fn().mockResolvedValue({
      totalDwellMs: 1200,
    });
    const warmApplicationFormBeforeFill = vi.fn().mockResolvedValue({
      totalDwellMs: 900,
    });
    const detectApplicationChallenge = vi
      .fn()
      .mockResolvedValueOnce(challengeSignal);

    vi.doMock('../../../packages/automation/src/apply/board-entry', () => ({
      reachApplicationForm,
    }));
    vi.doMock('../../../packages/automation/src/apply/form-scraper', () => ({
      scrapeApplicationFields,
    }));
    vi.doMock(
      '../../../packages/automation/src/apply/fill-plan-executor',
      () => ({
        executeApplicationFillPlan,
      })
    );
    vi.doMock(
      '../../../packages/automation/src/apply/openrouter-answer-module',
      () => ({
        generateApplicationFillPlan: vi.fn(),
      })
    );
    vi.doMock('../../../packages/automation/src/apply/trust-runtime', () => ({
      warmApplicationPageBeforeEntry,
      warmApplicationFormBeforeFill,
      detectApplicationChallenge,
    }));

    const { greenhouseApplicationSite } =
      await import('../../../packages/automation/src/apply/sites/greenhouse-apply');
    const context = createContext({
      siteKey: 'greenhouse',
      finalUrl: boardEntry.finalUrl,
      pageHtml: '<html><body>challenge</body></html>',
    });

    await greenhouseApplicationSite.run(context);

    expect(scrapeApplicationFields).not.toHaveBeenCalled();
    expect(executeApplicationFillPlan).not.toHaveBeenCalled();
    expect(context.pauseForManualReview).toHaveBeenCalledWith({
      step: 'before_scrape',
      message:
        'Greenhouse requested email verification before form completion.',
      stopReason: 'email_verification_required',
      details: expect.objectContaining({
        challengeSignal,
        boardEntry,
        preEntryWarmup: { totalDwellMs: 1200 },
        preFillWarmup: { totalDwellMs: 900 },
        profileDirectory: 'C:/profiles/apply/board',
        pageHtml: '<html><body>challenge</body></html>',
      }),
    });
  });

  test('submits into Greenhouse verification and pauses after code entry when Gmail verification is configured', async () => {
    const boardEntry = boardEntryBySite.greenhouse;
    const scrapedFields = scrapedFieldsBySite.greenhouse;
    const fillPlan = fillPlanBySite.greenhouse;
    const fieldDiagnostics = [
      {
        fieldId: scrapedFields[0].id,
        label: scrapedFields[0].label,
        type: scrapedFields[0].type,
        required: scrapedFields[0].required,
        answerability: 'direct_profile',
        category: 'accepted',
        rawAction: 'fill',
        normalizedAction: 'fill',
        expectedActions: ['fill'],
        reason: 'accepted',
        recovered: false,
      },
    ];
    const executionResult = {
      results: [
        {
          fieldId: scrapedFields[0].id,
          label: scrapedFields[0].label,
          action: 'fill',
          status: 'success',
          selector: scrapedFields[0].selectorCandidates[0],
          message: 'Filled field.',
        },
      ],
      summary: {
        total: 1,
        success: 1,
        skipped: 0,
        failed: 0,
      },
      telemetry: {
        totalPreFillDwellMs: 100,
        totalTypingDurationMs: 80,
        totalPointerActions: 2,
        forbiddenDirectApiUsage: [],
      },
    };

    const reachApplicationForm = vi.fn().mockResolvedValue(boardEntry);
    const scrapeApplicationFields = vi.fn().mockResolvedValue(scrapedFields);
    const generateApplicationFillPlan = vi.fn().mockResolvedValue({
      promptVersion: 'stage4-fill-plan-v1',
      rawResponseLength: 100,
      promptPayload: { fields: [] },
      responseJson: { items: fillPlan },
      fieldDiagnostics,
      fillPlan,
    });
    const executeApplicationFillPlan = vi.fn().mockResolvedValue(executionResult);
    const warmApplicationPageBeforeEntry = vi.fn().mockResolvedValue({
      totalDwellMs: 1200,
    });
    const warmApplicationFormBeforeFill = vi.fn().mockResolvedValue({
      totalDwellMs: 900,
    });
    const detectApplicationChallenge = vi.fn().mockResolvedValue(null);
    const createGmailApiClient = vi.fn().mockReturnValue({
      users: { messages: { list: vi.fn(), get: vi.fn() } },
    });
    const pollGmailForGreenhouseVerificationCode = vi.fn().mockResolvedValue({
      status: 'matched',
      code: 'KDpjDhqX',
      messageId: 'message-1',
      threadId: 'thread-1',
      subject: 'Security code for your application to Capco',
      receivedAt: '2026-04-22T01:40:25.000Z',
    });
    const submitGreenhouseApplicationAndEnterVerificationCode = vi
      .fn()
      .mockImplementation(async ({ retrieveCode }) => {
        const codeResult = await retrieveCode(new Date('2026-04-24T00:00:00.000Z'));
        if (codeResult.status !== 'matched') {
          return codeResult;
        }

        return {
          status: 'code_entered',
          messageId: codeResult.messageId,
          subject: codeResult.subject,
          codeLength: codeResult.code.length,
        };
      });

    vi.doMock('../../../packages/automation/src/apply/board-entry', () => ({
      reachApplicationForm,
    }));
    vi.doMock('../../../packages/automation/src/apply/form-scraper', () => ({
      scrapeApplicationFields,
    }));
    vi.doMock(
      '../../../packages/automation/src/apply/openrouter-answer-module',
      () => ({
        generateApplicationFillPlan,
      })
    );
    vi.doMock(
      '../../../packages/automation/src/apply/fill-plan-executor',
      () => ({
        executeApplicationFillPlan,
      })
    );
    vi.doMock('../../../packages/automation/src/apply/trust-runtime', () => ({
      warmApplicationPageBeforeEntry,
      warmApplicationFormBeforeFill,
      detectApplicationChallenge,
    }));
    vi.doMock('../../../packages/automation/src/apply/email-verification', async (importOriginal) => {
      const actual = await importOriginal<
        typeof import('../../../packages/automation/src/apply/email-verification')
      >();
      return {
        ...actual,
        isEnabledForGmailVerification: vi.fn().mockReturnValue(true),
        isConfiguredForGmailVerification: vi.fn().mockReturnValue(true),
        createGmailApiClient,
        pollGmailForGreenhouseVerificationCode,
        submitGreenhouseApplicationAndEnterVerificationCode,
      };
    });

    const { greenhouseApplicationSite } =
      await import('../../../packages/automation/src/apply/sites/greenhouse-apply');
    const context = createContext({
      siteKey: 'greenhouse',
      finalUrl: boardEntry.finalUrl,
    });
    context.applicantProfile = {
      id: 'default',
      fullName: 'Taylor Example',
      email: 'amromousa8@gmail.com',
      phone: '555-0100',
      location: 'Toronto, ON',
      summary: '',
      reusableContext: '',
      linkedinUrl: '',
      websiteUrl: '',
      baseResumeFileName: 'resume.tex',
      baseResumeTex: '\\section{Experience}',
      preferredCountries: ['CA'],
      jobKeywordProfile: null,
      jobKeywordProfileGeneratedAt: null,
      autofillProfile: { ...defaultMinimalAutofillProfile },
      emailVerification: {
        enabled: true,
        provider: 'gmail_oauth',
        gmailUserEmail: 'amromousa8@gmail.com',
        gmailClientId: 'client-id',
        gmailClientSecret: 'client-secret',
        gmailRefreshToken: 'refresh-token',
      },
      updatedAt: new Date('2026-04-23T00:00:00.000Z'),
    };

    await greenhouseApplicationSite.run(context);

    expect(submitGreenhouseApplicationAndEnterVerificationCode).toHaveBeenCalledTimes(1);
    expect(pollGmailForGreenhouseVerificationCode).toHaveBeenCalledWith(
      expect.objectContaining({
        userEmail: 'amromousa8@gmail.com',
        timeoutMs: 180000,
      })
    );
    expect(context.pauseForManualReview).toHaveBeenCalledWith({
      step: 'email_verification_code_entered',
      message: 'Entered the Greenhouse security code and paused before final resubmit.',
      stopReason: 'email_verification_code_entered',
      details: expect.objectContaining({
        boardEntry,
        scrapedFields,
        fillPlan,
        executionResult,
        verificationStatus: 'code_entered',
        verificationMessageId: 'message-1',
        verificationSubject: 'Security code for your application to Capco',
        verificationCodeLength: 8,
      }),
    });
  });

  test('submits into Greenhouse verification when enabled even if Gmail OAuth is incomplete', async () => {
    const boardEntry = boardEntryBySite.greenhouse;
    const scrapedFields = scrapedFieldsBySite.greenhouse;
    const fillPlan = fillPlanBySite.greenhouse;
    const executionResult = {
      results: [
        {
          fieldId: scrapedFields[0].id,
          label: scrapedFields[0].label,
          action: 'fill',
          status: 'success',
          selector: scrapedFields[0].selectorCandidates[0],
          message: 'Filled field.',
        },
      ],
      summary: {
        total: 1,
        success: 1,
        skipped: 0,
        failed: 0,
      },
      telemetry: {
        totalPreFillDwellMs: 100,
        totalTypingDurationMs: 80,
        totalPointerActions: 2,
        forbiddenDirectApiUsage: [],
      },
    };

    vi.doMock('../../../packages/automation/src/apply/board-entry', () => ({
      reachApplicationForm: vi.fn().mockResolvedValue(boardEntry),
    }));
    vi.doMock('../../../packages/automation/src/apply/form-scraper', () => ({
      scrapeApplicationFields: vi.fn().mockResolvedValue(scrapedFields),
    }));
    vi.doMock('../../../packages/automation/src/apply/openrouter-answer-module', () => ({
      generateApplicationFillPlan: vi.fn().mockResolvedValue({
        promptVersion: 'stage4-fill-plan-v1',
        rawResponseLength: 100,
        promptPayload: { fields: [] },
        responseJson: { items: fillPlan },
        fieldDiagnostics: [],
        fillPlan,
      }),
    }));
    vi.doMock('../../../packages/automation/src/apply/fill-plan-executor', () => ({
      executeApplicationFillPlan: vi.fn().mockResolvedValue(executionResult),
    }));
    vi.doMock('../../../packages/automation/src/apply/trust-runtime', () => ({
      warmApplicationPageBeforeEntry: vi.fn().mockResolvedValue({ totalDwellMs: 1200 }),
      warmApplicationFormBeforeFill: vi.fn().mockResolvedValue({ totalDwellMs: 900 }),
      detectApplicationChallenge: vi.fn().mockResolvedValue(null),
    }));
    const submitGreenhouseApplicationAndEnterVerificationCode = vi
      .fn()
      .mockImplementation(async ({ retrieveCode }) =>
        retrieveCode(new Date('2026-04-24T00:00:00.000Z'))
      );
    vi.doMock('../../../packages/automation/src/apply/email-verification', async (importOriginal) => {
      const actual = await importOriginal<
        typeof import('../../../packages/automation/src/apply/email-verification')
      >();
      return {
        ...actual,
        isEnabledForGmailVerification: vi.fn().mockReturnValue(true),
        isConfiguredForGmailVerification: vi.fn().mockReturnValue(false),
        createGmailApiClient: vi.fn(),
        pollGmailForGreenhouseVerificationCode: vi.fn(),
        submitGreenhouseApplicationAndEnterVerificationCode,
      };
    });

    const { greenhouseApplicationSite } =
      await import('../../../packages/automation/src/apply/sites/greenhouse-apply');
    const context = createContext({
      siteKey: 'greenhouse',
      finalUrl: boardEntry.finalUrl,
    });
    context.applicantProfile = {
      id: 'default',
      fullName: 'Taylor Example',
      email: 'amromousa8@gmail.com',
      phone: '555-0100',
      location: 'Toronto, ON',
      summary: '',
      reusableContext: '',
      linkedinUrl: '',
      websiteUrl: '',
      baseResumeFileName: 'resume.tex',
      baseResumeTex: '\\section{Experience}',
      preferredCountries: ['CA'],
      jobKeywordProfile: null,
      jobKeywordProfileGeneratedAt: null,
      autofillProfile: { ...defaultMinimalAutofillProfile },
      emailVerification: {
        enabled: true,
        provider: 'gmail_oauth',
        gmailUserEmail: 'amromousa8@gmail.com',
        gmailClientId: 'client-id',
        gmailClientSecret: '',
        gmailRefreshToken: '',
      },
      updatedAt: new Date('2026-04-23T00:00:00.000Z'),
    };

    await greenhouseApplicationSite.run(context);

    expect(submitGreenhouseApplicationAndEnterVerificationCode).toHaveBeenCalledTimes(1);
    expect(context.pauseForManualReview).toHaveBeenCalledWith({
      step: 'email_verification_required',
      message:
        'Greenhouse verification challenge triggered, but Gmail OAuth is incomplete. Add Gmail address, client ID, client secret, and refresh token in setup.',
      stopReason: 'not_configured',
      details: expect.objectContaining({
        verificationStatus: 'not_configured',
        boardEntry,
        scrapedFields,
        executionResult,
      }),
    });
  });

  test('uses env fallback config when applicant profile email verification is not populated', async () => {
    process.env.JOBAUTOMATION_GREENHOUSE_EMAIL_VERIFICATION_ENABLED = '1';
    process.env.JOBAUTOMATION_GMAIL_USER_EMAIL = 'amromousa8@gmail.com';
    process.env.JOBAUTOMATION_GMAIL_CLIENT_ID = 'client-id';
    process.env.JOBAUTOMATION_GMAIL_CLIENT_SECRET = 'client-secret';
    process.env.JOBAUTOMATION_GMAIL_REFRESH_TOKEN = 'refresh-token';

    const boardEntry = boardEntryBySite.greenhouse;
    const scrapedFields = scrapedFieldsBySite.greenhouse;
    const fillPlan = fillPlanBySite.greenhouse;

    vi.doMock('../../../packages/automation/src/apply/board-entry', () => ({
      reachApplicationForm: vi.fn().mockResolvedValue(boardEntry),
    }));
    vi.doMock('../../../packages/automation/src/apply/form-scraper', () => ({
      scrapeApplicationFields: vi.fn().mockResolvedValue(scrapedFields),
    }));
    vi.doMock('../../../packages/automation/src/apply/openrouter-answer-module', () => ({
      generateApplicationFillPlan: vi.fn().mockResolvedValue({
        promptVersion: 'stage4-fill-plan-v1',
        rawResponseLength: 100,
        promptPayload: { fields: [] },
        responseJson: { items: fillPlan },
        fieldDiagnostics: [],
        fillPlan,
      }),
    }));
    vi.doMock('../../../packages/automation/src/apply/fill-plan-executor', () => ({
      executeApplicationFillPlan: vi.fn().mockResolvedValue({
        results: [],
        summary: { total: 0, success: 0, skipped: 0, failed: 0 },
        telemetry: {
          totalPreFillDwellMs: 0,
          totalTypingDurationMs: 0,
          totalPointerActions: 0,
          forbiddenDirectApiUsage: [],
        },
      }),
    }));
    vi.doMock('../../../packages/automation/src/apply/trust-runtime', () => ({
      warmApplicationPageBeforeEntry: vi.fn().mockResolvedValue({ totalDwellMs: 1200 }),
      warmApplicationFormBeforeFill: vi.fn().mockResolvedValue({ totalDwellMs: 900 }),
      detectApplicationChallenge: vi.fn().mockResolvedValue(null),
    }));
    const submitGreenhouseApplicationAndEnterVerificationCode = vi
      .fn()
      .mockResolvedValue({
        status: 'code_entered',
        messageId: 'message-1',
        subject: 'Security code for your application to Capco',
        codeLength: 8,
      });
    vi.doMock('../../../packages/automation/src/apply/email-verification', async (importOriginal) => {
      const actual = await importOriginal<
        typeof import('../../../packages/automation/src/apply/email-verification')
      >();
      return {
        ...actual,
        createGmailApiClient: vi.fn().mockReturnValue({
          users: { messages: { list: vi.fn(), get: vi.fn() } },
        }),
        pollGmailForGreenhouseVerificationCode: vi.fn(),
        submitGreenhouseApplicationAndEnterVerificationCode,
      };
    });

    const { greenhouseApplicationSite } =
      await import('../../../packages/automation/src/apply/sites/greenhouse-apply');
    const context = createContext({
      siteKey: 'greenhouse',
      finalUrl: boardEntry.finalUrl,
    });

    await greenhouseApplicationSite.run(context);

    expect(submitGreenhouseApplicationAndEnterVerificationCode).toHaveBeenCalledTimes(1);

    delete process.env.JOBAUTOMATION_GREENHOUSE_EMAIL_VERIFICATION_ENABLED;
    delete process.env.JOBAUTOMATION_GMAIL_USER_EMAIL;
    delete process.env.JOBAUTOMATION_GMAIL_CLIENT_ID;
    delete process.env.JOBAUTOMATION_GMAIL_CLIENT_SECRET;
    delete process.env.JOBAUTOMATION_GMAIL_REFRESH_TOKEN;
  });
});

function createContext(input: {
  siteKey: 'greenhouse' | 'ashby' | 'lever';
  finalUrl: string;
  pageHtml?: string;
}): ApplicationSiteFlowContext {
  return {
    applicantProfile: null,
    artifacts: {
      resume: null,
      coverLetter: null,
    },
    job: {
      id: 'job-1',
      sourceKind: input.siteKey,
      sourceUrl: input.finalUrl,
      companyName: 'Example Corp',
      title: 'Platform Engineer',
      location: 'Toronto',
    },
    run: {
      id: 'run-1',
    },
    session: {
      page: {
        url: vi.fn().mockReturnValue(input.finalUrl),
        content: vi
          .fn()
          .mockResolvedValue(input.pageHtml ?? '<html><body>ok</body></html>'),
      },
      identity: {
        profileKind: 'apply',
        board: input.siteKey,
        userDataDir: 'C:/profiles/apply/board',
        os: 'windows',
        locale: 'en-CA',
        enableCache: true,
        humanize: true,
        firefoxUserPrefs: {},
        headless: false,
      },
      pacing: {
        preApplyReadDelayMs: [100, 120],
        sectionReadDelayMs: [60, 80],
        preFieldDelayMs: [40, 60],
        postFieldDelayMs: [30, 50],
        typingDelayMs: [20, 40],
      },
    },
    openRouter: {
      apiKey: 'test-key',
      baseUrl: 'https://openrouter.example/api/v1',
      model: 'openrouter/test-model',
    },
    logStep: vi.fn().mockResolvedValue(undefined),
    captureScreenshot: vi.fn().mockResolvedValue({
      artifactId: 'artifact-1',
      storagePath: 'C:/tmp/screenshot.png',
    }),
    stopBeforeSubmit: vi.fn(),
    pauseForManualReview: vi.fn().mockResolvedValue({
      id: 'run-1',
      status: 'paused',
      currentStep: 'fill_plan_executed',
    }),
  } as unknown as ApplicationSiteFlowContext;
}
