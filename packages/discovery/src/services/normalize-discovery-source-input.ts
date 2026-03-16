import type { DiscoverySourceInput, DiscoverySourceKind } from '@jobautomation/core';

function normalizeGreenhouseSourceKey(value: string): string {
  const trimmed = value.trim();

  try {
    const parsed = new URL(trimmed);
    if (
      parsed.hostname === 'boards.greenhouse.io' ||
      parsed.hostname === 'job-boards.greenhouse.io'
    ) {
      const [token] = parsed.pathname.split('/').filter(Boolean);
      if (token) {
        return token.toLowerCase();
      }
    }
  } catch {
    return trimmed.toLowerCase();
  }

  return trimmed.toLowerCase();
}

function normalizeLeverSourceKey(value: string): string {
  const trimmed = value.trim();

  try {
    const parsed = new URL(trimmed);
    if (parsed.hostname === 'jobs.lever.co') {
      const [handle] = parsed.pathname.split('/').filter(Boolean);
      if (handle) {
        return handle.toLowerCase();
      }
    }

    if (parsed.hostname === 'api.lever.co') {
      const segments = parsed.pathname.split('/').filter(Boolean);
      const postingsIndex = segments.findIndex((segment) => segment === 'postings');
      const handle = postingsIndex >= 0 ? segments[postingsIndex + 1] : null;
      if (handle) {
        return handle.toLowerCase();
      }
    }
  } catch {
    return trimmed.toLowerCase();
  }

  return trimmed.toLowerCase();
}

function normalizeAshbySourceKey(value: string): string {
  const trimmed = value.trim();

  try {
    const parsed = new URL(trimmed);
    if (parsed.hostname === 'jobs.ashbyhq.com') {
      const [board] = parsed.pathname.split('/').filter(Boolean);
      if (board) {
        return board.toLowerCase();
      }
    }

    if (parsed.hostname === 'api.ashbyhq.com') {
      const segments = parsed.pathname.split('/').filter(Boolean);
      const boardIndex = segments.findIndex((segment) => segment === 'job-board');
      const board = boardIndex >= 0 ? segments[boardIndex + 1] : null;
      if (board) {
        return board.toLowerCase();
      }
    }
  } catch {
    return trimmed.toLowerCase();
  }

  return trimmed.toLowerCase();
}

export function normalizeDiscoverySourceKey(
  sourceKind: DiscoverySourceKind,
  sourceKey: string
): string {
  switch (sourceKind) {
    case 'greenhouse':
      return normalizeGreenhouseSourceKey(sourceKey);
    case 'lever':
      return normalizeLeverSourceKey(sourceKey);
    case 'ashby':
      return normalizeAshbySourceKey(sourceKey);
  }
}

export function normalizeDiscoverySourceInput(input: DiscoverySourceInput): DiscoverySourceInput {
  return {
    ...input,
    sourceKey: normalizeDiscoverySourceKey(input.sourceKind, input.sourceKey)
  };
}
