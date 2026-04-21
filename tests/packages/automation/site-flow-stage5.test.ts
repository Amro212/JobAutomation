import { beforeEach, describe, expect, test, vi } from 'vitest';

import type { ApplicationSiteFlowContext } from '../../../packages/automation/src/apply/contracts';

describe('stage 5 site flow integration', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  test('executes the generated fill plan before pausing for Greenhouse review', async () => {
    const boardEntry = {
      board: 'greenhouse',
      entryAction: 'direct_form',
      startUrl: 'https://job-boards.greenhouse.io/example/jobs/1',
      finalUrl: 'https://job-boards.greenhouse.io/example/jobs/1',
      readyFieldCount: 1,
      rootSelector: '#application',
      rootIndex: 0
    };
    const scrapedFields = [
      {
        id: 'first_name',
        label: 'First Name',
        type: 'text',
        required: true,
        visible: true,
        enabled: true,
        selectorCandidates: ['#first_name'],
        options: []
      }
    ];
    const fillPlan = [
      {
        fieldId: 'first_name',
        action: 'fill',
        value: 'Taylor',
        confidence: 1,
        skipReason: ''
      }
    ];
    const fieldDiagnostics = [
      {
        fieldId: 'first_name',
        label: 'First Name',
        type: 'text',
        required: true,
        answerability: 'direct_profile',
        category: 'accepted',
        rawAction: 'fill',
        normalizedAction: 'fill',
        expectedActions: ['fill'],
        reason: 'accepted',
        recovered: false
      }
    ];
    const executionResult = {
      results: [
        {
          fieldId: 'first_name',
          label: 'First Name',
          action: 'fill',
          status: 'success',
          selector: '#first_name',
          message: 'Filled field.'
        }
      ],
      summary: {
        total: 1,
        success: 1,
        skipped: 0,
        failed: 0
      }
    };

    const reachApplicationForm = vi.fn().mockResolvedValue(boardEntry);
    const scrapeApplicationFields = vi.fn().mockResolvedValue(scrapedFields);
    const generateApplicationFillPlan = vi.fn().mockResolvedValue({
      promptVersion: 'stage4-fill-plan-v1',
      rawResponseLength: 100,
      promptPayload: { fields: [] },
      responseJson: { items: fillPlan },
      fieldDiagnostics,
      fillPlan
    });
    const executeApplicationFillPlan = vi.fn().mockResolvedValue(executionResult);

    vi.doMock('../../../packages/automation/src/apply/board-entry', () => ({
      reachApplicationForm
    }));
    vi.doMock('../../../packages/automation/src/apply/form-scraper', () => ({
      scrapeApplicationFields
    }));
    vi.doMock('../../../packages/automation/src/apply/openrouter-answer-module', () => ({
      generateApplicationFillPlan
    }));
    vi.doMock('../../../packages/automation/src/apply/fill-plan-executor', () => ({
      executeApplicationFillPlan
    }));

    const { greenhouseApplicationSite } = await import(
      '../../../packages/automation/src/apply/sites/greenhouse-apply'
    );
    const context = {
      applicantProfile: null,
      artifacts: {
        resume: null,
        coverLetter: null
      },
      job: {
        id: 'job-1',
        sourceKind: 'greenhouse',
        sourceUrl: boardEntry.startUrl,
        companyName: 'Example Corp',
        title: 'Platform Engineer',
        location: 'Toronto'
      },
      run: {
        id: 'run-1'
      },
      session: {
        page: {
          url: vi.fn().mockReturnValue(boardEntry.finalUrl)
        }
      },
      openRouter: {
        apiKey: 'test-key',
        baseUrl: 'https://openrouter.example/api/v1',
        model: 'openrouter/test-model'
      },
      logStep: vi.fn().mockResolvedValue(undefined),
      pauseForManualReview: vi.fn().mockResolvedValue({
        id: 'run-1',
        status: 'paused',
        currentStep: 'fill_plan_executed'
      })
    } as unknown as ApplicationSiteFlowContext;

    const result = await greenhouseApplicationSite.run(context);

    expect(executeApplicationFillPlan).toHaveBeenCalledWith({
      page: context.session.page,
      boardEntry,
      fields: scrapedFields,
      fillPlan
    });
    expect(context.logStep).toHaveBeenCalledWith(
      'fill_plan_executed',
      'Executed the Greenhouse fill plan against the current visible application form and stopped for Stage 5 review.',
      expect.objectContaining({
        boardEntry,
        scrapedFields,
        fieldDiagnostics,
        fillPlan,
        executionResult
      })
    );
    expect(context.pauseForManualReview).toHaveBeenCalledWith({
      step: 'fill_plan_executed',
      message: 'Paused after executing the Greenhouse fill plan for Stage 5 review.',
      details: expect.objectContaining({
        boardEntry,
        scrapedFields,
        fieldDiagnostics,
        fillPlan,
        executionResult
      })
    });
    expect(result).toEqual(
      expect.objectContaining({
        status: 'paused',
        currentStep: 'fill_plan_executed'
      })
    );
  });
});
