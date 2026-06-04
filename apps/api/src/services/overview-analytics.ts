import type { ApplicationRunStatus, ApplicationRunType } from '@jobautomation/core';
import type { GenerateStructuredObjectInput } from '@jobautomation/llm';

import type { StructuredAiProvider } from './ai-provider';

export type OverviewRange = '7d' | '30d' | 'ytd';

export type OverviewApplicationRunInput = {
  id: string;
  siteKey: ApplicationRunType;
  status: ApplicationRunStatus;
  stopReason: string | null;
  createdAt: Date;
  completedAt: Date | null;
};

export type OverviewChartPoint = {
  key: string;
  label: string;
  count: number;
};

export type OverviewPlatformSuccessRate = {
  siteKey: ApplicationRunType;
  label: string;
  attemptedCount: number;
  completedCount: number;
  failedCount: number;
  blockedCount: number;
  successRate: number;
};

export type OverviewAgentInsight = {
  severity: 'positive' | 'neutral' | 'warning';
  title: string;
  description: string;
};

export type OverviewAiOutput = {
  efficiencyScore: number;
  efficiencyRationale: string;
  insights: OverviewAgentInsight[];
};

export type OverviewAnalytics = {
  range: OverviewRange;
  generatedAt: string;
  metrics: {
    totalJobs: number;
    filteredMatch: number;
    totalApplications: number;
    completedApplications: number;
    blockedApplications: number;
    failedApplications: number;
    cancelledApplications: number;
    skippedApplications: number;
    successRate: number;
    applicationTrendPercent: number | null;
  };
  applicationsOverTime: OverviewChartPoint[];
  platformSuccessRates: OverviewPlatformSuccessRate[];
  agentInsights: OverviewAgentInsight[];
  agentEfficiencyScore: {
    value: number;
    source: 'computed' | 'ai';
    rationale: string;
  };
  ai: {
    configured: boolean;
    source: 'computed' | 'ai';
    error?: string;
  };
};

const overviewAiJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['efficiencyScore', 'efficiencyRationale', 'insights'],
  properties: {
    efficiencyScore: {
      type: 'integer',
      minimum: 0,
      maximum: 100
    },
    efficiencyRationale: {
      type: 'string',
      minLength: 1,
      maxLength: 240
    },
    insights: {
      type: 'array',
      minItems: 1,
      maxItems: 3,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['severity', 'title', 'description'],
        properties: {
          severity: {
            type: 'string',
            enum: ['positive', 'neutral', 'warning']
          },
          title: {
            type: 'string',
            minLength: 1,
            maxLength: 64
          },
          description: {
            type: 'string',
            minLength: 1,
            maxLength: 220
          }
        }
      }
    }
  }
} as const;

const terminalStatuses = new Set<ApplicationRunStatus>([
  'completed',
  'failed',
  'cancelled',
  'skipped',
  'paused',
  'retry'
]);

const blockedStatuses = new Set<ApplicationRunStatus>(['paused', 'retry']);

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function formatDayKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function siteLabel(siteKey: ApplicationRunType): string {
  switch (siteKey) {
    case 'greenhouse':
      return 'Greenhouse';
    case 'lever':
      return 'Lever';
    case 'ashby':
      return 'Ashby';
    default:
      return 'Playwright';
  }
}

export function parseOverviewRange(value: unknown): OverviewRange {
  return value === '30d' || value === 'ytd' ? value : '7d';
}

function completedInWindow(
  runs: OverviewApplicationRunInput[],
  startInclusive: Date,
  endExclusive: Date
): number {
  return runs.filter((run) => {
    if (run.status !== 'completed' || !run.completedAt) {
      return false;
    }
    return run.completedAt >= startInclusive && run.completedAt < endExclusive;
  }).length;
}

function buildApplicationsOverTime(
  runs: OverviewApplicationRunInput[],
  range: OverviewRange,
  now: Date
): OverviewChartPoint[] {
  const today = startOfDay(now);

  if (range === 'ytd') {
    return Array.from({ length: today.getMonth() + 1 }, (_, monthIndex) => {
      const start = new Date(today.getFullYear(), monthIndex, 1);
      const end = new Date(today.getFullYear(), monthIndex + 1, 1);
      return {
        key: `${today.getFullYear()}-${String(monthIndex + 1).padStart(2, '0')}`,
        label: start.toLocaleDateString(undefined, { month: 'short' }),
        count: completedInWindow(runs, start, end)
      };
    });
  }

  const days = range === '30d' ? 30 : 7;
  const firstDay = addDays(today, -(days - 1));
  return Array.from({ length: days }, (_, index) => {
    const bucketStart = addDays(firstDay, index);
    const bucketEnd = addDays(bucketStart, 1);
    return {
      key: formatDayKey(bucketStart),
      label:
        range === '7d'
          ? bucketStart.toLocaleDateString(undefined, { weekday: 'short' })
          : bucketStart.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
      count: completedInWindow(runs, bucketStart, bucketEnd)
    };
  });
}

function trendPercentForRange(
  runs: OverviewApplicationRunInput[],
  range: OverviewRange,
  now: Date
): number | null {
  const today = startOfDay(now);
  const end = addDays(today, 1);
  const start =
    range === 'ytd'
      ? new Date(today.getFullYear(), 0, 1)
      : addDays(today, -((range === '30d' ? 30 : 7) - 1));
  const durationMs = end.getTime() - start.getTime();
  const previousStart = new Date(start.getTime() - durationMs);
  const current = completedInWindow(runs, start, end);
  const previous = completedInWindow(runs, previousStart, start);

  if (previous === 0) {
    return current === 0 ? null : 100;
  }

  return Math.round(((current - previous) / previous) * 100);
}

function buildPlatformSuccessRates(
  runs: OverviewApplicationRunInput[]
): OverviewPlatformSuccessRate[] {
  const groups = new Map<ApplicationRunType, OverviewApplicationRunInput[]>();

  for (const run of runs) {
    const current = groups.get(run.siteKey) ?? [];
    current.push(run);
    groups.set(run.siteKey, current);
  }

  return [...groups.entries()]
    .map(([siteKey, siteRuns]) => {
      const attempted = siteRuns.filter((run) => terminalStatuses.has(run.status));
      const attemptedCount = attempted.length;
      const completedCount = attempted.filter((run) => run.status === 'completed').length;
      const failedCount = attempted.filter(
        (run) => run.status === 'failed' || run.status === 'cancelled'
      ).length;
      const blockedCount = attempted.filter((run) => blockedStatuses.has(run.status)).length;

      return {
        siteKey,
        label: siteLabel(siteKey),
        attemptedCount,
        completedCount,
        failedCount,
        blockedCount,
        successRate: attemptedCount > 0 ? clampPercent((completedCount / attemptedCount) * 100) : 0
      };
    })
    .sort((a, b) => b.attemptedCount - a.attemptedCount || b.successRate - a.successRate);
}

function fallbackInsights(input: {
  metrics: OverviewAnalytics['metrics'];
  platformSuccessRates: OverviewPlatformSuccessRate[];
}): OverviewAgentInsight[] {
  const insights: OverviewAgentInsight[] = [];
  const { metrics } = input;

  if (metrics.totalApplications === 0) {
    return [
      {
        severity: 'neutral',
        title: 'No application runs yet',
        description: 'Start an application run to populate success rates, platform health, and efficiency scoring.'
      }
    ];
  }

  insights.push({
    severity: metrics.successRate >= 70 ? 'positive' : 'neutral',
    title: metrics.successRate >= 70 ? 'Submission flow is converting' : 'Submission flow needs more completed runs',
    description: `${metrics.completedApplications} of ${metrics.totalApplications} application runs completed successfully, for a ${metrics.successRate}% success rate.`
  });

  if (metrics.blockedApplications > 0) {
    insights.push({
      severity: 'warning',
      title: 'Blocked runs need review',
      description: `${metrics.blockedApplications} application run${metrics.blockedApplications === 1 ? '' : 's'} is paused or queued for retry. Review these before increasing automation volume.`
    });
  }

  const weakestPlatform = input.platformSuccessRates
    .filter((platform) => platform.attemptedCount > 0)
    .sort((a, b) => a.successRate - b.successRate)[0];

  if (weakestPlatform) {
    insights.push({
      severity: weakestPlatform.successRate < 50 ? 'warning' : 'neutral',
      title: `${weakestPlatform.label} success rate`,
      description: `${weakestPlatform.completedCount} of ${weakestPlatform.attemptedCount} ${weakestPlatform.label} attempts completed successfully.`
    });
  }

  return insights.slice(0, 3);
}

function computeEfficiencyScore(metrics: OverviewAnalytics['metrics']): {
  value: number;
  rationale: string;
} {
  if (metrics.totalApplications === 0) {
    return {
      value: 0,
      rationale: 'No application runs have been recorded yet.'
    };
  }

  const failedRate = (metrics.failedApplications / metrics.totalApplications) * 100;
  const blockedRate = (metrics.blockedApplications / metrics.totalApplications) * 100;
  const value = clampPercent(metrics.successRate * 0.7 + (100 - failedRate) * 0.2 + (100 - blockedRate) * 0.1);

  return {
    value,
    rationale: 'Computed from completion rate, failed run rate, and blocked run rate.'
  };
}

export function buildOverviewAnalytics(input: {
  now: Date;
  range: OverviewRange;
  totalJobs: number;
  filteredMatch: number;
  applicationRuns: OverviewApplicationRunInput[];
}): OverviewAnalytics {
  const totalApplications = input.applicationRuns.length;
  const completedApplications = input.applicationRuns.filter((run) => run.status === 'completed').length;
  const blockedApplications = input.applicationRuns.filter((run) => blockedStatuses.has(run.status)).length;
  const failedApplications = input.applicationRuns.filter((run) => run.status === 'failed').length;
  const cancelledApplications = input.applicationRuns.filter((run) => run.status === 'cancelled').length;
  const skippedApplications = input.applicationRuns.filter((run) => run.status === 'skipped').length;
  const metrics = {
    totalJobs: input.totalJobs,
    filteredMatch: input.filteredMatch,
    totalApplications,
    completedApplications,
    blockedApplications,
    failedApplications,
    cancelledApplications,
    skippedApplications,
    successRate:
      totalApplications > 0 ? clampPercent((completedApplications / totalApplications) * 100) : 0,
    applicationTrendPercent: trendPercentForRange(input.applicationRuns, input.range, input.now)
  };
  const platformSuccessRates = buildPlatformSuccessRates(input.applicationRuns);
  const fallbackScore = computeEfficiencyScore(metrics);

  return {
    range: input.range,
    generatedAt: input.now.toISOString(),
    metrics,
    applicationsOverTime: buildApplicationsOverTime(input.applicationRuns, input.range, input.now),
    platformSuccessRates,
    agentInsights: fallbackInsights({ metrics, platformSuccessRates }),
    agentEfficiencyScore: {
      value: fallbackScore.value,
      source: 'computed',
      rationale: fallbackScore.rationale
    },
    ai: {
      configured: false,
      source: 'computed'
    }
  };
}

export function buildOverviewAiRequest(analytics: OverviewAnalytics): GenerateStructuredObjectInput {
  const snapshot = {
    range: analytics.range,
    generatedAt: analytics.generatedAt,
    metrics: analytics.metrics,
    applicationsOverTime: analytics.applicationsOverTime,
    platformSuccessRates: analytics.platformSuccessRates
  };

  return {
    schemaName: 'overview_agent_insights',
    schema: overviewAiJsonSchema as unknown as Record<string, unknown>,
    systemPrompt: [
      'You are an operations analyst for an automated job application agent.',
      'Use only the supplied analytics snapshot. Do not invent interview rates, recruiter response rates, optimal submission times, or platform failures that are not present in the data.',
      'Return concise, end-user-facing insights that explain what needs attention on the dashboard.',
      'The efficiency score must be an integer from 0 to 100 based on completion rate, blocked runs, failures, and platform reliability.',
      'Return only the JSON object.'
    ].join('\n'),
    prompt: [
      'Create up to three dashboard insights and one agent efficiency score from this analytics snapshot.',
      JSON.stringify(snapshot, null, 2)
    ].join('\n\n')
  };
}

function parseOverviewAiOutput(value: unknown): OverviewAiOutput | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const record = value as Record<string, unknown>;
  const efficiencyScore =
    typeof record.efficiencyScore === 'number' ? Math.trunc(record.efficiencyScore) : null;
  const efficiencyRationale =
    typeof record.efficiencyRationale === 'string' ? record.efficiencyRationale.trim() : '';
  const insights = Array.isArray(record.insights)
    ? record.insights
        .map((entry): OverviewAgentInsight | null => {
          if (!entry || typeof entry !== 'object') {
            return null;
          }
          const insight = entry as Record<string, unknown>;
          const severity = insight.severity;
          if (severity !== 'positive' && severity !== 'neutral' && severity !== 'warning') {
            return null;
          }
          if (typeof insight.title !== 'string' || typeof insight.description !== 'string') {
            return null;
          }
          return {
            severity,
            title: insight.title.trim().slice(0, 64),
            description: insight.description.trim().slice(0, 220)
          };
        })
        .filter((entry): entry is OverviewAgentInsight => entry !== null)
    : [];

  if (
    efficiencyScore === null ||
    efficiencyScore < 0 ||
    efficiencyScore > 100 ||
    efficiencyRationale.length === 0 ||
    insights.length === 0
  ) {
    return null;
  }

  return {
    efficiencyScore,
    efficiencyRationale: efficiencyRationale.slice(0, 240),
    insights: insights.slice(0, 3)
  };
}

export async function generateOverviewAiInsights(input: {
  analytics: OverviewAnalytics;
  provider: Pick<StructuredAiProvider, 'generateStructuredObject'> | null;
}): Promise<OverviewAnalytics> {
  if (!input.provider) {
    return {
      ...input.analytics,
      ai: {
        configured: false,
        source: 'computed'
      }
    };
  }

  try {
    const result = await input.provider.generateStructuredObject(
      buildOverviewAiRequest(input.analytics)
    );
    const parsed = parseOverviewAiOutput(result);

    if (!parsed) {
      throw new Error('AI returned an invalid overview insight payload.');
    }

    return {
      ...input.analytics,
      agentInsights: parsed.insights,
      agentEfficiencyScore: {
        value: parsed.efficiencyScore,
        source: 'ai',
        rationale: parsed.efficiencyRationale
      },
      ai: {
        configured: true,
        source: 'ai'
      }
    };
  } catch (error) {
    return {
      ...input.analytics,
      ai: {
        configured: true,
        source: 'computed',
        error: error instanceof Error ? error.message : 'AI insights request failed.'
      }
    };
  }
}
