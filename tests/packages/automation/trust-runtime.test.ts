import { describe, expect, test, vi } from 'vitest';

import { detectApplicationChallenge } from '../../../packages/automation/src/apply/trust-runtime';

describe('application trust runtime challenge detection', () => {
  test('does not treat the passive Greenhouse reCAPTCHA badge as a blocking challenge', async () => {
    const page = createProbePage({
      visibleSelectors: new Set(['iframe[src*="recaptcha"]']),
      visibleText: []
    });

    await expect(
      detectApplicationChallenge({
        page,
        board: 'greenhouse',
        phase: 'after_fill'
      })
    ).resolves.toBeNull();
  });

  test('continues past passive captcha wording but still pauses for Greenhouse email verification', async () => {
    const page = createProbePage({
      visibleSelectors: new Set(),
      visibleText: ['captcha', 'enter the code']
    });

    await expect(
      detectApplicationChallenge({
        page,
        board: 'greenhouse',
        phase: 'before_scrape'
      })
    ).resolves.toEqual(
      expect.objectContaining({
        kind: 'email_verification_required',
        phase: 'before_scrape'
      })
    );
  });

  test('treats Greenhouse security code wording as email verification challenge', async () => {
    const page = createProbePage({
      visibleSelectors: new Set(),
      visibleText: ['security code', 'check your email']
    });

    await expect(
      detectApplicationChallenge({
        page,
        board: 'greenhouse',
        phase: 'after_submit'
      })
    ).resolves.toEqual(
      expect.objectContaining({
        kind: 'email_verification_required',
        phase: 'after_submit'
      })
    );
  });
});

function createProbePage(input: {
  visibleSelectors: Set<string>;
  visibleText: string[];
}) {
  return {
    url: vi.fn().mockReturnValue('https://job-boards.greenhouse.io/example/jobs/1'),
    locator: vi.fn((selector: string) => ({
      first: vi.fn(() => ({
        isVisible: vi.fn().mockResolvedValue(input.visibleSelectors.has(selector))
      }))
    })),
    getByText: vi.fn((pattern: RegExp) => ({
      first: vi.fn(() => ({
        isVisible: vi
          .fn()
          .mockResolvedValue(input.visibleText.some((visibleText) => pattern.test(visibleText)))
      }))
    }))
  } as never;
}
