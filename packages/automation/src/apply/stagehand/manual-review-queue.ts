import type { ApplyAgentResult, UnknownField } from './apply-agent';

// ── TYPES ────────────────────────────────────────────────────────────────────

export type ManualReviewReason =
  | 'unknown_required_fields'
  | 'captcha_detected'
  | 'automation_failed'
  | 'partial_completion';

export type ManualReviewItem = {
  id: string;
  jobId: string;
  jobUrl: string;
  applicationUrl: string;
  reason: ManualReviewReason;
  unknownFields: UnknownField[];
  captchaDetected: boolean;
  filledFields: string[];
  automationError?: string;
  createdAt: Date;
  resolvedAt?: Date;
  resolution?: 'completed_manually' | 'skipped' | 'retry_automation';
  notes?: string;
};

export type ManualReviewQueue = {
  items: ManualReviewItem[];
};

// ── QUEUE OPERATIONS ─────────────────────────────────────────────────────────

const reviewQueue: ManualReviewQueue = { items: [] };

function generateId(): string {
  return `review_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Adds a completed (or failed) application run to the manual review queue
 * if it requires human attention.
 */
export function queueForManualReview(
  jobId: string,
  result: ApplyAgentResult
): ManualReviewItem | null {
  // Determine if manual review is needed
  if (result.status === 'completed' && result.unknownFields.length === 0) {
    // No review needed
    return null;
  }

  const reason = determineReviewReason(result);
  if (!reason) {
    return null;
  }

  const item: ManualReviewItem = {
    id: generateId(),
    jobId,
    jobUrl: result.jobUrl,
    applicationUrl: result.applicationUrl,
    reason,
    unknownFields: result.unknownFields,
    captchaDetected: result.captchaDetected,
    filledFields: result.filledFields,
    automationError: result.error,
    createdAt: new Date()
  };

  reviewQueue.items.push(item);
  return item;
}

function determineReviewReason(result: ApplyAgentResult): ManualReviewReason | null {
  if (result.captchaDetected) {
    return 'captcha_detected';
  }

  if (result.status === 'failed') {
    return 'automation_failed';
  }

  if (result.unknownFields.length > 0) {
    return 'unknown_required_fields';
  }

  if (result.status === 'needs_review') {
    return 'partial_completion';
  }

  return null;
}

/**
 * Gets all pending review items.
 */
export function getPendingReviews(): ManualReviewItem[] {
  return reviewQueue.items.filter((item) => !item.resolvedAt);
}

/**
 * Gets review items by reason.
 */
export function getReviewsByReason(reason: ManualReviewReason): ManualReviewItem[] {
  return reviewQueue.items.filter(
    (item) => item.reason === reason && !item.resolvedAt
  );
}

/**
 * Gets a specific review item.
 */
export function getReviewItem(id: string): ManualReviewItem | null {
  return reviewQueue.items.find((item) => item.id === id) ?? null;
}

/**
 * Resolves a review item.
 */
export function resolveReviewItem(
  id: string,
  resolution: ManualReviewItem['resolution'],
  notes?: string
): ManualReviewItem | null {
  const item = reviewQueue.items.find((i) => i.id === id);
  if (!item) {
    return null;
  }

  item.resolvedAt = new Date();
  item.resolution = resolution;
  item.notes = notes;
  return item;
}

/**
 * Gets queue statistics.
 */
export function getQueueStats(): {
  total: number;
  pending: number;
  resolved: number;
  byReason: Record<ManualReviewReason, number>;
} {
  const pending = reviewQueue.items.filter((item) => !item.resolvedAt);
  const resolved = reviewQueue.items.filter((item) => item.resolvedAt);

  const byReason: Record<ManualReviewReason, number> = {
    unknown_required_fields: 0,
    captcha_detected: 0,
    automation_failed: 0,
    partial_completion: 0
  };

  for (const item of pending) {
    byReason[item.reason]++;
  }

  return {
    total: reviewQueue.items.length,
    pending: pending.length,
    resolved: resolved.length,
    byReason
  };
}

// ── FORMATTING FOR DISPLAY ───────────────────────────────────────────────────

/**
 * Formats unknown fields for display in review UI.
 */
export function formatUnknownFields(fields: UnknownField[]): string {
  if (fields.length === 0) {
    return '(none)';
  }

  return fields
    .map((f) => `• ${f.label} [${f.fieldType}]${f.required ? ' (required)' : ''}`)
    .join('\n');
}

/**
 * Formats a review item for console/log output.
 */
export function formatReviewItem(item: ManualReviewItem): string {
  const lines = [
    `═══════════════════════════════════════`,
    `MANUAL REVIEW REQUIRED`,
    `═══════════════════════════════════════`,
    `ID:          ${item.id}`,
    `Job ID:      ${item.jobId}`,
    `Reason:      ${item.reason.replace(/_/g, ' ').toUpperCase()}`,
    `Created:     ${item.createdAt.toISOString()}`,
    ``,
    `Job URL:     ${item.jobUrl}`,
    `Form URL:    ${item.applicationUrl}`,
    ``
  ];

  if (item.captchaDetected) {
    lines.push(`⚠️  CAPTCHA DETECTED - Human interaction required`);
    lines.push(``);
  }

  if (item.unknownFields.length > 0) {
    lines.push(`Unknown Required Fields:`);
    lines.push(formatUnknownFields(item.unknownFields));
    lines.push(``);
  }

  if (item.automationError) {
    lines.push(`Automation Error:`);
    lines.push(`  ${item.automationError}`);
    lines.push(``);
  }

  lines.push(`Fields Successfully Filled (${item.filledFields.length}):`);
  if (item.filledFields.length > 0) {
    lines.push(item.filledFields.map((f) => `  ✓ ${f}`).join('\n'));
  } else {
    lines.push(`  (none)`);
  }

  lines.push(`═══════════════════════════════════════`);

  return lines.join('\n');
}

// ── DATABASE PERSISTENCE (stub for integration) ──────────────────────────────

export type ManualReviewRepository = {
  create: (item: Omit<ManualReviewItem, 'id'>) => Promise<ManualReviewItem>;
  findById: (id: string) => Promise<ManualReviewItem | null>;
  findPending: () => Promise<ManualReviewItem[]>;
  update: (id: string, patch: Partial<ManualReviewItem>) => Promise<ManualReviewItem | null>;
};

/**
 * Creates a database-backed review queue (for integration with Drizzle/SQLite).
 * The in-memory queue above is for standalone usage; use this for persistence.
 */
export function createDatabaseReviewQueue(repository: ManualReviewRepository) {
  return {
    async queue(jobId: string, result: ApplyAgentResult): Promise<ManualReviewItem | null> {
      const reason = determineReviewReason(result);
      if (!reason) {
        return null;
      }

      return repository.create({
        jobId,
        jobUrl: result.jobUrl,
        applicationUrl: result.applicationUrl,
        reason,
        unknownFields: result.unknownFields,
        captchaDetected: result.captchaDetected,
        filledFields: result.filledFields,
        automationError: result.error,
        createdAt: new Date()
      });
    },

    async getPending(): Promise<ManualReviewItem[]> {
      return repository.findPending();
    },

    async resolve(
      id: string,
      resolution: ManualReviewItem['resolution'],
      notes?: string
    ): Promise<ManualReviewItem | null> {
      return repository.update(id, {
        resolvedAt: new Date(),
        resolution,
        notes
      });
    }
  };
}
