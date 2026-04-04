import { defaultExtendedProfile } from '../../../packages/core/src/extended-profile';
import { beforeEach, describe, expect, test, vi } from 'vitest';

const actMock = vi.hoisted(() => vi.fn());
const closeMock = vi.hoisted(() => vi.fn());
const createStagehandInstanceMock = vi.hoisted(() => vi.fn());

vi.mock('../../../packages/automation/src/stagehand/stagehand-client', () => ({
  createStagehandInstance: createStagehandInstanceMock
}));

vi.mock('../../../packages/automation/src/apply/stagehand/system-prompt-builder', () => ({
  buildSystemPrompt: vi.fn(() => 'system prompt'),
  buildFieldInstruction: vi.fn((label: string) => `Fill ${label}`)
}));

import { attemptStagehandFieldFill } from '../../../packages/automation/src/apply/stagehand-field-handler';

describe('stagehand field handler', () => {
  beforeEach(() => {
    actMock.mockReset();
    closeMock.mockReset();
    closeMock.mockResolvedValue(undefined);
    createStagehandInstanceMock.mockReset();

    createStagehandInstanceMock.mockResolvedValue({
      page: {},
      init: vi.fn(),
      close: closeMock,
      extract: vi.fn(),
      observe: vi.fn(),
      act: actMock
    });
  });

  test('runs act() against the existing Playwright page instance', async () => {
    const pageRef = { url: () => 'https://example.com/form' } as never;

    actMock.mockResolvedValue({
      success: true,
      action: 'fill',
      message: 'ok'
    });

    const results = await attemptStagehandFieldFill({
      page: pageRef,
      targetFields: [
        {
          label: 'Will you require sponsorship?',
          selector: '#sponsorship',
          controlType: 'text'
        }
      ],
      profile: defaultExtendedProfile,
      jobContext: {
        country: 'Canada',
        description: 'Test role'
      },
      cdpUrl: 'http://127.0.0.1:9222'
    });

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      fieldLabel: 'Will you require sponsorship?',
      success: true
    });

    expect(actMock).toHaveBeenCalledWith(
      expect.stringContaining('Only act on the field labeled "Will you require sponsorship?"'),
      expect.objectContaining({
        page: pageRef
      })
    );
    expect(closeMock).toHaveBeenCalledTimes(1);
  });

  test('returns failed field results when Stagehand session initialization fails', async () => {
    createStagehandInstanceMock.mockRejectedValueOnce(new Error('Unexpected server response: 404'));

    const results = await attemptStagehandFieldFill({
      page: { url: () => 'https://example.com/form' } as never,
      targetFields: [
        {
          label: 'Are you legally authorized to work in the country where the job is located?',
          selector: '#question_auth',
          controlType: 'select'
        }
      ],
      profile: defaultExtendedProfile,
      jobContext: {
        country: 'Canada',
        description: 'Test role'
      },
      cdpUrl: 'ws://127.0.0.1:9222/devtools/browser/mock'
    });

    expect(results).toEqual([
      expect.objectContaining({
        fieldLabel: 'Are you legally authorized to work in the country where the job is located?',
        success: false,
        error: expect.stringContaining('Unexpected server response: 404')
      })
    ]);
  });
});
