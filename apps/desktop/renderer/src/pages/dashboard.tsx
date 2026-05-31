import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import {
  Zap,
  Briefcase,
  Send,
  FolderOpen,
  Settings,
  ArrowRight,
  Activity,
  Terminal
} from 'lucide-react';

import { getJobs, getApplicationRuns, getAutopilotRuns } from '@renderer/lib/api';
import { cn } from '@renderer/lib/utils';

/* ──────────────────────────────────────────────────────────────
   Dashboard Overview
   Matches the Stitch "Dashboard Overview" wireframe.
   Bento grid of navigation cards + live agent stream preview.
   ────────────────────────────────────────────────────────────── */

interface DashboardMetrics {
  totalJobs: number;
  totalApplications: number;
  totalAutopilotRuns: number;
}

export function DashboardPage() {
  const [metrics, setMetrics] = useState<DashboardMetrics>({
    totalJobs: 0,
    totalApplications: 0,
    totalAutopilotRuns: 0
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadMetrics() {
      try {
        const [jobsRes, appRuns, autopilotRuns] = await Promise.allSettled([
          // Optimize by querying 1 item since we only need the total count for the metric
          getJobs({ page: 1, pageSize: 1 } as any),
          getApplicationRuns(),
          getAutopilotRuns()
        ]);

        setMetrics({
          totalJobs: jobsRes.status === 'fulfilled' ? jobsRes.value.total : 0,
          totalApplications:
            appRuns.status === 'fulfilled' ? appRuns.value.length : 0,
          totalAutopilotRuns:
            autopilotRuns.status === 'fulfilled' ? autopilotRuns.value.length : 0
        });
      } catch {
        // Silently handle — metrics show 0
      } finally {
        setLoading(false);
      }
    }

    void loadMetrics();
  }, []);

  return (
    <div className="space-y-8">
      {/* ── Hero Section ───────────────────────────────────── */}
      <section className="relative rounded-2xl overflow-hidden glass-panel p-8 lg:p-10">
        {/* Decorative gradient */}
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent pointer-events-none" />
        <div className="absolute top-0 right-0 w-48 h-48 bg-primary/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/4 pointer-events-none" />

        <div className="relative z-10 max-w-2xl">
          <div className="flex items-center gap-2 mb-4">
            <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-border bg-muted/50 text-xs font-semibold text-muted-foreground">
              <span className="h-2 w-2 rounded-full bg-primary animate-pulse" />
              Control Panel
            </span>
          </div>

          <h2 className="font-headline text-3xl lg:text-4xl font-bold text-foreground leading-tight mb-3 tracking-tight">
            Local-first job hunt automation.
          </h2>

          <p className="text-base text-muted-foreground leading-relaxed max-w-xl">
            Monitor active browser automation, AI-assisted document tailoring,
            and discovery pipelines from a single control surface.
          </p>
        </div>
      </section>

      {/* ── Bento Grid ─────────────────────────────────────── */}
      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <DashboardCard
          to="/autopilot"
          icon={Zap}
          title="Autopilot"
          description="Launch a full discovery-to-submit batch and monitor outcomes."
          {...(metrics.totalAutopilotRuns > 0 ? { metric: `${metrics.totalAutopilotRuns} runs` } : {})}
          loading={loading}
          accentColor="text-amber-600 dark:text-amber-400"
        />

        <DashboardCard
          to="/jobs"
          icon={Briefcase}
          title="Jobs"
          description="Inspect structured discovery output, applied state, and matching scores."
          {...(metrics.totalJobs > 0 ? { metric: `${metrics.totalJobs} discovered` } : {})}
          loading={loading}
          accentColor="text-sky-600 dark:text-sky-400"
        />

        <DashboardCard
          to="/submitted"
          icon={Send}
          title="Submitted"
          description="Review confirmed submissions with the exact resume and cover letter used."
          loading={loading}
          accentColor="text-emerald-600 dark:text-emerald-400"
        />

        <DashboardCard
          to="/applications"
          icon={FolderOpen}
          title="Applications"
          description="Inspect the full application run history, including blocked and failed runs."
          {...(metrics.totalApplications > 0 ? { metric: `${metrics.totalApplications} runs` } : {})}
          loading={loading}
          className="lg:col-span-2"
          accentColor="text-violet-600 dark:text-violet-400"
        />

        <DashboardCard
          to="/setup"
          icon={Settings}
          title="Setup"
          description="Store the reusable applicant context and base LaTeX resume source."
          loading={loading}
          accentColor="text-rose-600 dark:text-rose-400"
        />
      </section>

      {/* ── Agent Stream Preview ───────────────────────────── */}
      <section className="glass-panel rounded-xl p-5 border border-border">
        <div className="flex items-center justify-between mb-3 pb-2 border-b border-border">
          <h3 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase flex items-center gap-2">
            <Terminal className="h-4 w-4" />
            Active Agent Stream
          </h3>
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <Activity className="h-3 w-3" />
            Live
          </span>
        </div>

        <div className="font-mono text-sm text-muted-foreground space-y-1.5 h-28 overflow-y-auto">
          <LogLine time="--:--:--" text="Waiting for agent activity..." dim />
        </div>
      </section>
    </div>
  );
}

/* ── Dashboard Card ──────────────────────────────────────────── */

function DashboardCard({
  to,
  icon: Icon,
  title,
  description,
  metric,
  loading,
  className,
  accentColor = 'text-primary'
}: {
  to: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  title: string;
  description: string;
  metric?: string;
  loading?: boolean;
  className?: string;
  accentColor?: string;
}) {
  return (
    <Link
      to={to}
      className={cn(
        'group glass-card rounded-xl p-5 flex flex-col relative overflow-hidden cursor-pointer',
        className
      )}
    >
      {/* Decorative corner */}
      <div className="absolute top-0 right-0 w-24 h-24 bg-primary/[0.03] rounded-bl-full transition-transform duration-300 group-hover:scale-110" />

      <div className="flex items-start justify-between mb-3 relative z-10">
        <div className="flex items-center gap-2.5">
          <div className={cn('p-2 rounded-lg bg-muted/60', accentColor)}>
            <Icon className="h-4 w-4" strokeWidth={1.8} />
          </div>
          <h3 className="font-headline text-lg font-semibold text-foreground">
            {title}
          </h3>
        </div>
        <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-200" />
      </div>

      <p className="text-sm text-muted-foreground leading-relaxed flex-grow relative z-10">
        {description}
      </p>

      {(metric || loading) && (
        <div className="mt-4 pt-3 border-t border-border relative z-10">
          {loading ? (
            <div className="h-4 w-20 rounded bg-muted animate-pulse" />
          ) : (
            <span className="text-xs font-semibold text-primary">{metric}</span>
          )}
        </div>
      )}
    </Link>
  );
}

/* ── Log Line ────────────────────────────────────────────────── */

function LogLine({
  time,
  text,
  dim = false
}: {
  time: string;
  text: string;
  dim?: boolean;
}) {
  return (
    <div
      className={cn(
        'flex items-start gap-2',
        dim && 'opacity-50'
      )}
    >
      <span className="text-primary shrink-0">[{time}]</span>
      <span>{text}</span>
    </div>
  );
}
