import type { Page } from 'playwright';

import type { ApplicationBoardEntryResult, SupportedApplicationBoard } from './board-entry';
import type { ApplicationChallengeSignal, InteractionPacingProfile } from './contracts';

type WarmupResult = {
  totalDwellMs: number;
};

type ChallengeProbe = {
  kind: ApplicationChallengeSignal['kind'];
  message: string;
  selectors?: string[];
  textPattern?: RegExp;
};

const DEFAULT_READ_DELAYS: Record<
  SupportedApplicationBoard,
  {
    initial: [number, number];
    section: [number, number];
    header: [number, number];
  }
> = {
  greenhouse: {
    initial: [700, 1100],
    section: [200, 400],
    header: [250, 500]
  },
  ashby: {
    initial: [900, 1400],
    section: [400, 750],
    header: [350, 650]
  },
  lever: {
    initial: [1000, 1500],
    section: [300, 600],
    header: [500, 950]
  }
};

const CHALLENGE_PROBES: Record<SupportedApplicationBoard, ChallengeProbe[]> = {
  greenhouse: [
    {
      kind: 'email_verification_required',
      message: 'Greenhouse requested email verification before form completion.',
      textPattern: /verification code|security code|check your email|6-digit code|enter the code/i
    }
  ],
  ashby: [
    {
      kind: 'challenge_detected',
      message: 'Ashby exposed an explicit anti-bot challenge.',
      textPattern: /suspicious activity|application spam|blocked automated/i
    }
  ],
  lever: [
    {
      kind: 'cloudflare_interstitial_detected',
      message: 'Lever exposed a Cloudflare or Turnstile interstitial.',
      selectors: [
        '[class*="cf-challenge"]',
        '[id*="cf-challenge"]'
      ],
      textPattern: /checking your browser|cloudflare/i
    }
  ]
};

function randomBetween([min, max]: [number, number]): number {
  if (max <= min) {
    return min;
  }

  return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function dwell(page: Page, range: [number, number]): Promise<number> {
  const duration = randomBetween(range);
  await page.waitForTimeout(duration);
  return duration;
}

function resolveSectionRange(
  board: SupportedApplicationBoard,
  pacing?: InteractionPacingProfile
): [number, number] {
  return pacing?.sectionReadDelayMs ?? DEFAULT_READ_DELAYS[board].section;
}

function resolveInitialRange(
  board: SupportedApplicationBoard,
  pacing?: InteractionPacingProfile
): [number, number] {
  return pacing?.preApplyReadDelayMs ?? DEFAULT_READ_DELAYS[board].initial;
}

function resolveHeaderRange(
  board: SupportedApplicationBoard,
  pacing?: InteractionPacingProfile
): [number, number] {
  return pacing?.preFieldDelayMs ?? DEFAULT_READ_DELAYS[board].header;
}

export async function warmApplicationPageBeforeEntry(input: {
  page: Page;
  board: SupportedApplicationBoard;
  pacing?: InteractionPacingProfile;
}): Promise<WarmupResult> {
  let totalDwellMs = 0;

  await input.page.waitForLoadState('domcontentloaded');
  totalDwellMs += await dwell(input.page, resolveInitialRange(input.board, input.pacing));

  for (const deltaY of [420, 560, 360]) {
    await input.page.mouse.wheel(0, deltaY);
    totalDwellMs += await dwell(input.page, resolveSectionRange(input.board, input.pacing));
  }

  await input.page.mouse.wheel(0, -320);
  totalDwellMs += await dwell(input.page, resolveHeaderRange(input.board, input.pacing));

  return {
    totalDwellMs
  };
}

export async function warmApplicationFormBeforeFill(input: {
  page: Page;
  board: SupportedApplicationBoard;
  boardEntry: ApplicationBoardEntryResult;
  pacing?: InteractionPacingProfile;
}): Promise<WarmupResult> {
  const root = input.page.locator(input.boardEntry.rootSelector).nth(input.boardEntry.rootIndex);
  let totalDwellMs = 0;

  await root.scrollIntoViewIfNeeded().catch(() => undefined);
  totalDwellMs += await dwell(input.page, resolveHeaderRange(input.board, input.pacing));

  for (const deltaY of [180, 240]) {
    await input.page.mouse.wheel(0, deltaY);
    totalDwellMs += await dwell(input.page, resolveSectionRange(input.board, input.pacing));
  }

  await root.scrollIntoViewIfNeeded().catch(() => undefined);
  totalDwellMs += await dwell(input.page, resolveHeaderRange(input.board, input.pacing));

  return {
    totalDwellMs
  };
}

async function anySelectorVisible(page: Page, selectors: string[]): Promise<boolean> {
  for (const selector of selectors) {
    const visible = await page.locator(selector).first().isVisible().catch(() => false);
    if (visible) {
      return true;
    }
  }

  return false;
}

async function textPatternVisible(page: Page, pattern: RegExp): Promise<boolean> {
  return page.getByText(pattern).first().isVisible().catch(() => false);
}

export async function detectApplicationChallenge(input: {
  page: Page;
  board: SupportedApplicationBoard;
  phase: string;
}): Promise<ApplicationChallengeSignal | null> {
  for (const probe of CHALLENGE_PROBES[input.board]) {
    const selectorHit =
      probe.selectors && probe.selectors.length > 0
        ? await anySelectorVisible(input.page, probe.selectors)
        : false;
    const textHit = probe.textPattern ? await textPatternVisible(input.page, probe.textPattern) : false;

    if (!selectorHit && !textHit) {
      continue;
    }

    return {
      kind: probe.kind,
      phase: input.phase,
      message: probe.message,
      url: input.page.url(),
      ...(probe.selectors ? { selectors: probe.selectors } : {})
    };
  }

  return null;
}
