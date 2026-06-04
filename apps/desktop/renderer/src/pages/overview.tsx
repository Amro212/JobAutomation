import { useEffect, useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import {
  AlertTriangle,
  BrainCircuit,
  CheckCircle2,
  Clock,
  FileText,
  Lightbulb,
  TrendingDown,
  TrendingUp
} from 'lucide-react';
import { motion, useSpring, useTransform } from 'framer-motion';
import { toast } from 'sonner';

import {
  getOverviewAnalytics,
  type OverviewAgentInsight,
  type OverviewAnalytics,
  type OverviewRange
} from '@renderer/lib/api';
import { cn } from '@renderer/lib/utils';

function AnimatedNumber({ value }: { value: number }) {
  const spring = useSpring(0, { bounce: 0, duration: 1200 });
  const display = useTransform(spring, (current) => Math.round(current).toLocaleString());

  useEffect(() => {
    spring.set(value);
  }, [spring, value]);

  return <motion.span>{display}</motion.span>;
}

const rangeOptions: Array<{ value: OverviewRange; label: string; ariaLabel: string }> = [
  { value: '7d', label: '7D', ariaLabel: 'Show completed applications for the last 7 days' },
  { value: '30d', label: '30D', ariaLabel: 'Show completed applications for the last 30 days' },
  { value: 'ytd', label: 'YTD', ariaLabel: 'Show completed applications for year to date' }
];

const emptyAnalytics: OverviewAnalytics = {
  range: '7d',
  generatedAt: new Date(0).toISOString(),
  metrics: {
    totalJobs: 0,
    filteredMatch: 0,
    totalApplications: 0,
    completedApplications: 0,
    blockedApplications: 0,
    failedApplications: 0,
    cancelledApplications: 0,
    skippedApplications: 0,
    successRate: 0,
    applicationTrendPercent: null
  },
  applicationsOverTime: [],
  platformSuccessRates: [],
  agentInsights: [],
  agentEfficiencyScore: {
    value: 0,
    source: 'computed',
    rationale: 'No application runs have been recorded yet.'
  },
  ai: {
    configured: false,
    source: 'computed'
  }
};

function formatTrend(value: number | null): string {
  if (value === null) {
    return 'No prior';
  }
  if (value === 0) {
    return '0%';
  }
  return `${value > 0 ? '+' : ''}${value}%`;
}

function chartSummary(analytics: OverviewAnalytics): string {
  if (analytics.applicationsOverTime.length === 0) {
    return 'No completed application submissions in this range.';
  }

  const total = analytics.applicationsOverTime.reduce((sum, point) => sum + point.count, 0);
  const peak = analytics.applicationsOverTime.reduce((best, point) =>
    point.count > best.count ? point : best
  );

  return `${total} completed application submissions in this range. Peak volume was ${peak.count} on ${peak.label}.`;
}

function ChartTooltip({
  active,
  payload,
  label
}: {
  active?: boolean;
  payload?: Array<{ value?: number }>;
  label?: string;
}) {
  if (!active || !payload?.length) {
    return null;
  }

  const count = Number(payload[0]?.value ?? 0);

  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 text-card-foreground shadow-lg">
      <p className="text-xs font-semibold text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-bold">{count.toLocaleString()} completed</p>
    </div>
  );
}

function insightIcon(insight: OverviewAgentInsight) {
  if (insight.severity === 'warning') {
    return <AlertTriangle className="h-4 w-4 text-destructive" aria-hidden="true" />;
  }
  if (insight.severity === 'positive') {
    return <CheckCircle2 className="h-4 w-4 text-emerald-700 dark:text-emerald-400" aria-hidden="true" />;
  }
  return <Clock className="h-4 w-4 text-muted-foreground" aria-hidden="true" />;
}

function insightTone(insight: OverviewAgentInsight): string {
  if (insight.severity === 'warning') {
    return 'bg-destructive/10';
  }
  if (insight.severity === 'positive') {
    return 'bg-emerald-500/10';
  }
  return 'bg-muted';
}

export function OverviewPage() {
  const [range, setRange] = useState<OverviewRange>('7d');
  const [analytics, setAnalytics] = useState<OverviewAnalytics>(emptyAnalytics);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadAnalytics() {
      setIsLoading(true);
      setError(null);
      try {
        const next = await getOverviewAnalytics(range);
        if (!active) {
          return;
        }
        setAnalytics(next);
        if (next.ai.error) {
          toast.warning('AI insights used computed fallback', {
            description: next.ai.error
          });
        }
      } catch (loadError) {
        if (!active) {
          return;
        }
        const message =
          loadError instanceof Error ? loadError.message : 'Failed to load overview analytics.';
        setError(message);
        toast.error(message);
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    }

    void loadAnalytics();

    return () => {
      active = false;
    };
  }, [range]);

  const maxChartValue = useMemo(
    () => Math.max(1, ...analytics.applicationsOverTime.map((point) => point.count)),
    [analytics.applicationsOverTime]
  );
  const trendValue = analytics.metrics.applicationTrendPercent;
  const TrendIcon = trendValue != null && trendValue < 0 ? TrendingDown : TrendingUp;

  return (
    <div className="mx-auto max-w-[1920px] space-y-8 pb-12 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="mb-4 flex flex-col items-start justify-between gap-4 md:flex-row md:items-end">
        <div>
          <h1 className="font-headline text-4xl font-semibold text-foreground lg:text-5xl">
            Performance Analytics
          </h1>
          <p className="mt-2 max-w-2xl text-lg leading-relaxed text-muted-foreground">
            Real-time monitoring of automated job submissions, conversion rates, and live agent activity.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="glass-panel flex items-center gap-2 rounded-full border border-border/50 px-4 py-2 text-sm font-semibold text-foreground">
            <span className="h-2 w-2 rounded-full bg-emerald-600 dark:bg-emerald-400" aria-hidden="true" />
            Live Sync
          </div>
        </div>
      </div>

      {error ? (
        <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-foreground">
          {error}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-6 md:grid-cols-12">
        <section className="glass-panel relative flex flex-col gap-6 overflow-hidden rounded-2xl border border-border/50 p-8 md:col-span-8">
          <div className="z-10 flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
            <div>
              <h2 className="font-headline text-2xl font-semibold text-foreground">
                Applications Over Time
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Completed automated submissions across all targeted platforms.
              </p>
            </div>
            <div className="flex gap-2" role="group" aria-label="Application chart range">
              {rangeOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  aria-label={option.ariaLabel}
                  aria-pressed={range === option.value}
                  disabled={isLoading && range === option.value}
                  onClick={() => setRange(option.value)}
                  className={cn(
                    'rounded-full border px-3 py-1 text-xs font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-60',
                    range === option.value
                      ? 'border-primary/30 bg-primary/10 text-primary'
                      : 'border-border/60 bg-muted text-muted-foreground hover:bg-muted/70'
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div
            className="z-10 mt-2 h-[340px] w-full"
            role="img"
            aria-label={chartSummary(analytics)}
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={analytics.applicationsOverTime}
                margin={{ top: 16, right: 8, left: 0, bottom: range === '30d' ? 34 : 22 }}
                barCategoryGap={range === '30d' ? '20%' : '28%'}
              >
                <CartesianGrid
                  vertical={false}
                  stroke="hsl(var(--border))"
                  strokeDasharray="3 6"
                  opacity={0.55}
                />
                <YAxis
                  width={38}
                  allowDecimals={false}
                  domain={[0, maxChartValue]}
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                />
                <XAxis
                  dataKey="label"
                  axisLine={false}
                  tickLine={false}
                  tick={{
                    fill: 'hsl(var(--muted-foreground))',
                    fontSize: 12,
                    fontWeight: 600
                  }}
                  interval={range === '30d' ? 4 : 0}
                  angle={range === '30d' ? -35 : 0}
                  textAnchor={range === '30d' ? 'end' : 'middle'}
                  height={range === '30d' ? 62 : 46}
                  tickMargin={12}
                />
                <Tooltip
                  cursor={{ fill: 'hsl(var(--muted) / 0.45)' }}
                  content={<ChartTooltip />}
                />
                <Bar dataKey="count" radius={[8, 8, 0, 0]} maxBarSize={72} isAnimationActive>
                  {analytics.applicationsOverTime.map((entry, index) => (
                    <Cell
                      key={`${entry.key}-${index}`}
                      className="fill-primary"
                      opacity={entry.count === 0 ? 0.35 : 1}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="sr-only">{chartSummary(analytics)}</p>
        </section>

        <section className="glass-panel flex flex-col gap-6 rounded-2xl border border-border/50 p-8 md:col-span-4">
          <div>
            <h2 className="font-headline text-2xl font-semibold text-foreground">Conversion Funnel</h2>
            <p className="mt-1 text-sm text-muted-foreground">From discovery to successfully submitted.</p>
          </div>
          <div className="relative flex flex-grow flex-col justify-center gap-4">
            <div className="relative z-10 flex w-full items-center justify-between rounded-xl border border-border/40 bg-muted/40 p-4">
              <span className="text-sm font-semibold text-foreground">Jobs Discovered</span>
              <span className="font-headline text-xl font-semibold text-primary">
                <AnimatedNumber value={analytics.metrics.totalJobs} />
              </span>
            </div>
            <div className="mx-auto h-4 w-px bg-border" aria-hidden="true" />
            <div className="relative w-full px-4">
              <div className="relative z-10 flex w-full items-center justify-between rounded-xl border border-border/60 bg-muted/60 p-4">
                <span className="text-sm font-semibold text-foreground">Filtered Match</span>
                <span className="font-headline text-xl font-semibold text-primary">
                  <AnimatedNumber value={analytics.metrics.filteredMatch} />
                </span>
              </div>
            </div>
            <div className="mx-auto h-4 w-px bg-border" aria-hidden="true" />
            <div className="relative w-full px-8">
              <div className="relative z-10 flex w-full items-center justify-between rounded-xl border border-primary/20 bg-primary/10 p-4">
                <span className="text-sm font-semibold text-foreground">Successfully Submitted</span>
                <span className="font-headline text-xl font-bold text-primary">
                  <AnimatedNumber value={analytics.metrics.completedApplications} />
                </span>
              </div>
            </div>
          </div>
        </section>

        <section className="glass-panel flex flex-col gap-8 rounded-2xl border border-border/50 p-8 md:col-span-6">
          <div className="flex items-center justify-between">
            <h2 className="font-headline text-2xl font-semibold text-foreground">Platform Success Rates</h2>
            <span className="text-xs font-semibold text-muted-foreground">
              {analytics.metrics.totalApplications.toLocaleString()} runs
            </span>
          </div>

          {analytics.platformSuccessRates.length === 0 ? (
            <p className="rounded-lg border border-border/50 bg-muted/40 p-4 text-sm text-muted-foreground">
              No platform attempts have been recorded yet.
            </p>
          ) : (
            <div className="flex flex-col gap-6">
              {analytics.platformSuccessRates.map((platform, index) => (
                <div className="space-y-2" key={platform.siteKey}>
                  <div className="flex items-center gap-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted/50 font-headline text-lg font-bold text-foreground">
                      {platform.label.charAt(0)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="mb-1.5 flex items-center justify-between gap-3">
                        <span className="truncate text-sm font-semibold">{platform.label}</span>
                        <span className="shrink-0 text-sm font-semibold text-muted-foreground">
                          {platform.successRate}% Success
                        </span>
                      </div>
                      <div
                        className="h-2 w-full overflow-hidden rounded-full bg-muted"
                        aria-label={`${platform.label} success rate ${platform.successRate}%`}
                      >
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${platform.successRate}%` }}
                          transition={{ duration: 1, delay: 0.1 + index * 0.08, ease: 'easeOut' }}
                          className={cn(
                            'h-full rounded-full',
                            platform.successRate < 50 ? 'bg-destructive' : 'bg-primary'
                          )}
                        />
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {platform.completedCount} completed of {platform.attemptedCount} resolved attempts
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="glass-panel relative flex flex-col gap-6 overflow-hidden rounded-2xl border border-border/50 p-8 md:col-span-6">
          <div className="pointer-events-none absolute -bottom-10 -right-10 opacity-5">
            <BrainCircuit className="h-64 w-64" aria-hidden="true" />
          </div>
          <div className="mb-2 flex items-center gap-2">
            <Lightbulb className="h-5 w-5 text-primary" aria-hidden="true" />
            <h2 className="font-headline text-2xl font-semibold text-foreground">Agent Insights</h2>
          </div>

          <div className="z-10 flex flex-col gap-5" aria-live="polite">
            {analytics.agentInsights.length === 0 ? (
              <p className="rounded-lg border border-border/50 bg-muted/40 p-4 text-sm text-muted-foreground">
                Insights will appear after the first analytics refresh.
              </p>
            ) : (
              analytics.agentInsights.map((insight) => (
                <div className="flex items-start gap-4" key={`${insight.title}-${insight.severity}`}>
                  <div className={cn('mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full', insightTone(insight))}>
                    {insightIcon(insight)}
                  </div>
                  <div className="text-sm leading-relaxed text-muted-foreground">
                    <p className="font-semibold text-foreground">{insight.title}</p>
                    <p>{insight.description}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="glass-panel flex h-48 flex-col justify-between rounded-2xl border border-border/50 p-6 transition-colors hover:border-primary/30 md:col-span-6">
          <div className="flex items-start justify-between">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
              <FileText className="h-6 w-6" aria-hidden="true" />
            </div>
            <div
              className={cn(
                'flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold',
                trendValue == null
                  ? 'border-border/50 bg-muted text-muted-foreground'
                  : trendValue < 0
                    ? 'border-destructive/20 bg-destructive/10 text-destructive'
                    : 'border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
              )}
            >
              <TrendIcon className="h-3 w-3" aria-hidden="true" />
              {formatTrend(trendValue)}
            </div>
          </div>
          <div className="mt-4">
            <div className="mb-1 text-sm font-semibold text-muted-foreground">Total Applications</div>
            <div className="font-headline text-5xl font-bold text-foreground">
              <AnimatedNumber value={analytics.metrics.totalApplications} />
            </div>
          </div>
        </section>

        <section className="glass-panel flex h-48 flex-col justify-between rounded-2xl border border-border/50 bg-card/70 p-6 shadow-lg md:col-span-6">
          <div className="flex items-start justify-between">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <BrainCircuit className="h-6 w-6" aria-hidden="true" />
            </div>
            <span className="rounded-full border border-border/50 bg-muted px-2.5 py-1 text-xs font-semibold text-muted-foreground">
              {analytics.agentEfficiencyScore.source === 'ai' ? 'AI scored' : 'Computed'}
            </span>
          </div>
          <div className="mt-4">
            <div className="mb-2 text-sm font-semibold text-muted-foreground">Agent Efficiency Score</div>
            <div className="mb-3 flex items-end gap-2">
              <div className="font-headline text-5xl font-bold leading-none text-foreground">
                <AnimatedNumber value={analytics.agentEfficiencyScore.value} />
              </div>
              <div className="mb-1 font-semibold text-muted-foreground">/100</div>
            </div>
            <div
              className="h-2 w-full overflow-hidden rounded-full bg-muted"
              aria-label={`Agent efficiency score ${analytics.agentEfficiencyScore.value} out of 100`}
            >
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${analytics.agentEfficiencyScore.value}%` }}
                transition={{ duration: 1.2, delay: 0.2, ease: 'easeOut' }}
                className="h-full rounded-full bg-primary"
              />
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
