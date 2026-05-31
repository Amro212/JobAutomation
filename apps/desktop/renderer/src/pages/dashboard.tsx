import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import {
  Zap,
  Briefcase,
  Send,
  FolderOpen,
  Settings,
  ArrowRight,
  Settings as SettingsIcon,
  Rocket
} from 'lucide-react';

import { getJobs, getApplicationRuns, getAutopilotRuns } from '@renderer/lib/api';
import { cn } from '@renderer/lib/utils';

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

  useEffect(() => {
    async function loadMetrics() {
      try {
        const [jobsRes, appRuns, autopilotRuns] = await Promise.allSettled([
          getJobs({ page: 1, pageSize: 1 } as any),
          getApplicationRuns(),
          getAutopilotRuns()
        ]);

        setMetrics({
          totalJobs: jobsRes.status === 'fulfilled' ? jobsRes.value.total : 0,
          totalApplications: appRuns.status === 'fulfilled' ? appRuns.value.length : 0,
          totalAutopilotRuns: autopilotRuns.status === 'fulfilled' ? autopilotRuns.value.length : 0
        });
      } catch {
        // Silently handle
      }
    }
    void loadMetrics();
  }, []);

  return (
    <div className="space-y-8">
      {/* ── Hero Section ───────────────────────────────────── */}
      <section className="relative rounded-2xl overflow-hidden glass-panel p-8 lg:p-12 min-h-[300px] flex flex-col justify-end">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/10 to-transparent pointer-events-none" />
        <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/4 pointer-events-none" />
        
        <div className="relative z-10 max-w-3xl">
          <div className="flex items-center gap-3 mb-4">
            <span className="px-3 py-1 rounded-full bg-muted border border-border text-xs font-semibold tracking-wider text-secondary uppercase font-label flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
              Autopilot Status: Active
            </span>
            <span className="text-xs font-label text-muted-foreground bg-muted/50 px-2 py-1 rounded-md">Batch A</span>
          </div>

          <h2 className="font-headline text-4xl lg:text-5xl font-bold text-foreground leading-tight mb-4 tracking-tight">
            Local-first job hunt automation.
          </h2>

          <p className="text-lg text-muted-foreground max-w-2xl leading-relaxed">
            The dashboard ships early so persistence, discovery, and setup state are inspectable from the start instead of hidden behind background processes. Monitor active browser automation and AI-assisted document tailoring in real-time.
          </p>
        </div>
      </section>

      {/* ── Bento Grid ─────────────────────────────────────── */}
      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        
        {/* Autopilot Card */}
        <Link to="/autopilot" className="glass-card rounded-xl p-6 flex flex-col h-full group cursor-pointer relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-bl-full transition-transform duration-300 group-hover:scale-110" />
          <div className="flex justify-between items-start mb-4 relative z-10">
            <h3 className="font-headline text-2xl font-semibold text-foreground">Autopilot</h3>
            <ArrowRight className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
          </div>
          <p className="text-sm text-muted-foreground flex-grow relative z-10">
            Launch a full discovery-to-submit batch and monitor blocked versus submitted outcomes.
          </p>
          <div className="mt-6 pt-4 border-t border-border flex justify-between items-center relative z-10">
            <span className="text-xs font-semibold text-primary">Running Tools</span>
            <SettingsIcon className="h-4 w-4 text-primary animate-spin" style={{ animationDuration: '3s' }} />
          </div>
        </Link>

        {/* Jobs Card */}
        <Link to="/jobs" className="glass-card rounded-xl p-6 flex flex-col h-full group cursor-pointer relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-accent/5 rounded-bl-full transition-transform duration-300 group-hover:scale-110" />
          <div className="flex justify-between items-start mb-4 relative z-10">
            <h3 className="font-headline text-2xl font-semibold text-foreground">Jobs</h3>
            <ArrowRight className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
          </div>
          <p className="text-sm text-muted-foreground flex-grow relative z-10">
            Inspect structured discovery output, applied state, and downstream automation entry points.
          </p>
          <div className="mt-6 pt-4 border-t border-border flex items-center gap-2 relative z-10">
            <span className="px-2 py-1 bg-muted rounded text-xs font-semibold">{metrics.totalJobs} Discovered</span>
            <span className="px-2 py-1 bg-primary/10 text-primary rounded text-xs font-semibold">12 New</span>
          </div>
        </Link>

        {/* Submitted Card */}
        <Link to="/submitted" className="glass-card rounded-xl p-6 flex flex-col h-full group cursor-pointer relative overflow-hidden">
          <div className="flex justify-between items-start mb-4 relative z-10">
            <h3 className="font-headline text-2xl font-semibold text-foreground">Submitted</h3>
            <ArrowRight className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
          </div>
          <p className="text-sm text-muted-foreground flex-grow relative z-10">
            Review confirmed submissions with the exact resume and cover letter used.
          </p>
          <div className="mt-6 flex items-end justify-between relative z-10">
            <div>
              <span className="block text-3xl font-headline font-bold text-primary">87</span>
              <span className="text-xs text-muted-foreground uppercase tracking-wider">Total</span>
            </div>
            <div className="w-16 h-8 bg-muted rounded-t-sm relative flex items-end gap-1 p-1">
              <div className="w-1/3 bg-secondary/40 h-1/3 rounded-t-sm" />
              <div className="w-1/3 bg-primary/40 h-2/3 rounded-t-sm" />
              <div className="w-1/3 bg-primary h-full rounded-t-sm" />
            </div>
          </div>
        </Link>

        {/* Applications Card */}
        <Link to="/applications" className="glass-card rounded-xl p-6 flex flex-col h-full group cursor-pointer lg:col-span-2 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-transparent to-muted/30 pointer-events-none" />
          <div className="flex justify-between items-start mb-4 relative z-10">
            <h3 className="font-headline text-2xl font-semibold text-foreground">Applications</h3>
            <ArrowRight className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
          </div>
          <div className="flex-grow flex flex-col md:flex-row gap-6 relative z-10">
            <p className="text-sm text-muted-foreground md:w-1/2">
              Inspect the full application run history, including blocked and failed runs across different platforms.
            </p>
            <div className="md:w-1/2 flex flex-col justify-center space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-emerald-500" /> Success</span>
                <span className="font-semibold">68%</span>
              </div>
              <div className="w-full bg-muted rounded-full h-1.5">
                <div className="bg-emerald-500 h-1.5 rounded-full" style={{ width: '68%' }} />
              </div>
              <div className="flex items-center justify-between text-sm pt-2">
                <span className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-destructive" /> Blocked</span>
                <span className="font-semibold">32%</span>
              </div>
              <div className="w-full bg-muted rounded-full h-1.5">
                <div className="bg-destructive h-1.5 rounded-full" style={{ width: '32%' }} />
              </div>
            </div>
          </div>
        </Link>

        {/* Setup Card */}
        <Link to="/setup" className="glass-card rounded-xl p-6 flex flex-col h-full group cursor-pointer relative overflow-hidden bg-muted/20">
          <div className="flex justify-between items-start mb-4 relative z-10">
            <h3 className="font-headline text-2xl font-semibold text-foreground">Setup</h3>
            <ArrowRight className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
          </div>
          <p className="text-sm text-muted-foreground flex-grow relative z-10 mb-6">
            Store the reusable applicant context and base LaTeX resume source.
          </p>
          <div className="mt-auto relative z-10">
            <div className="w-full py-2 border border-border rounded-lg text-sm font-semibold text-center group-hover:border-primary group-hover:text-primary transition-colors">
              Edit Configuration
            </div>
          </div>
        </Link>

      </section>
    </div>
  );
}
