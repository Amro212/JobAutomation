import { useEffect, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router';
import {
  ChevronLeft,
  ExternalLink,
  RefreshCw,
  Clock,
  Zap,
  Building2,
  Download
} from 'lucide-react';
import { toast } from 'sonner';

import { getAutopilotRun, buildArtifactFileUrl } from '@renderer/lib/api';
import type { AutopilotRunDetail } from '@renderer/lib/api';
import { AnimatedStatusIcon } from '@renderer/components/animated-status-icon';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { cn } from '@renderer/lib/utils';

/* ── Helpers ──────────────────────────────────────────────────── */

function statusVariant(status: string): 'success' | 'destructive' | 'warning' | 'info' | 'outline' {
  switch (status) {
    case 'completed':
      return 'success';
    case 'failed':
    case 'cancelled':
    case 'blocked':
      return 'destructive';
    case 'running':
    case 'pending':
      return 'info';
    default:
      return 'outline';
  }
}

function formatDate(date: Date | string | null | undefined): string {
  if (!date) return '—';
  const d = date instanceof Date ? date : new Date(date);
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function formatDuration(start: Date | string | null | undefined, end: Date | string | null | undefined): string {
  if (!start) return '—';
  const s = start instanceof Date ? start : new Date(start);
  const e = end ? (end instanceof Date ? end : new Date(end)) : new Date();
  const diffMs = e.getTime() - s.getTime();
  const mins = Math.floor(diffMs / 60_000);
  const secs = Math.floor((diffMs % 60_000) / 1_000);
  if (mins === 0) return `${secs}s`;
  return `${mins}m ${secs}s`;
}

function statusLabel(status: string): string {
  switch (status) {
    case 'completed':
      return 'Run Completed';
    case 'failed':
      return 'Run Failed';
    case 'cancelled':
      return 'Run Cancelled';
    case 'running':
      return 'Run In Progress';
    case 'pending':
      return 'Run Queued';
    default:
      return status;
  }
}

function statusIconVariant(status: string): 'completed' | 'failed' | 'running' {
  switch (status) {
    case 'completed':
      return 'completed';
    case 'failed':
    case 'cancelled':
      return 'failed';
    default:
      return 'running';
  }
}

/* ── Metric Card ──────────────────────────────────────────────── */

function MetricCard({
  label,
  value,
  accent
}: {
  label: string;
  value: number;
  accent?: 'positive' | 'negative' | 'neutral';
}) {
  return (
    <Card>
      <CardContent className="p-4 text-center">
        <p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold mb-1">
          {label}
        </p>
        <p
          className={cn(
            'font-headline text-2xl font-bold',
            accent === 'positive' && 'text-emerald-800 dark:text-emerald-400',
            accent === 'negative' && 'text-red-800 dark:text-red-400'
          )}
        >
          {value}
        </p>
      </CardContent>
    </Card>
  );
}

/* ── Main Page Component ──────────────────────────────────────── */

export function AutopilotRunDetailPage() {
  const { runId = '' } = useParams();
  const navigate = useNavigate();
  const [detail, setDetail] = useState<AutopilotRunDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const refresh = async () => {
    setLoading(true);
    try {
      const data = await getAutopilotRun(runId);
      if (!data) {
        setNotFound(true);
      } else {
        setDetail(data);
        setNotFound(false);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load run details');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, [runId]);

  // Auto-refresh while running
  useEffect(() => {
    if (!detail || (detail.run.status !== 'running' && detail.run.status !== 'pending')) return;
    const id = window.setInterval(() => void refresh(), 5_000);
    return () => window.clearInterval(id);
  }, [detail?.run.status]);

  /* ── Loading State ──────────────────────────────────────────── */
  if (loading && !detail) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-40 w-full rounded-2xl" />
        <div className="grid grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    );
  }

  /* ── Not Found State ────────────────────────────────────────── */
  if (notFound) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <AnimatedStatusIcon variant="failed" size={48} className="mb-4" />
        <h2 className="font-headline text-xl font-semibold mb-2">Run Not Found</h2>
        <p className="text-sm text-muted-foreground mb-6">
          The autopilot run you are looking for does not exist or has been removed.
        </p>
        <Button variant="outline" onClick={() => navigate('/autopilot-runs')}>
          <ChevronLeft className="h-4 w-4 mr-2" aria-hidden="true" />
          Back to Autopilot Runs
        </Button>
      </div>
    );
  }

  if (!detail) return null;

  const { run, applications } = detail;
  const totalProcessed = run.submittedCount + run.blockedCount + run.failedCount;
  const progressPct = run.eligibleJobCount > 0
    ? Math.round((totalProcessed / run.eligibleJobCount) * 100)
    : run.status === 'completed' ? 100 : 0;
  const isActive = run.status === 'running' || run.status === 'pending';

  return (
    <div className="space-y-6">
      {/* ── Status Banner ──────────────────────────────────────── */}
      <section
        className="relative overflow-hidden rounded-2xl border border-border bg-card/60 backdrop-blur-xl p-8"
        aria-labelledby="run-status-heading"
      >
        {/* Decorative gradient */}
        <div className="absolute -top-20 -right-20 w-52 h-52 bg-primary/5 rounded-full blur-3xl pointer-events-none" aria-hidden="true" />

        <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center gap-6">
          {/* Back button */}
          <Button
            variant="outline"
            size="icon"
            onClick={() => navigate('/autopilot-runs')}
            className="rounded-xl shrink-0"
            aria-label="Back to autopilot runs"
          >
            <ChevronLeft className="h-5 w-5" />
          </Button>

          {/* Status icon */}
          <AnimatedStatusIcon variant={statusIconVariant(run.status)} size={52} />

          {/* Text */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-1">
              <h1
                id="run-status-heading"
                className="font-headline text-2xl font-semibold tracking-tight text-foreground"
              >
                {statusLabel(run.status)}
              </h1>
              <Badge
                variant={statusVariant(run.status)}
                className={cn('capitalize', isActive && 'animate-pulse')}
              >
                {run.status}
              </Badge>
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <Zap className="h-3.5 w-3.5" aria-hidden="true" />
                Run {run.id.slice(0, 8)}
              </span>
              <span className="flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                {formatDate(run.createdAt)}
              </span>
              {run.startedAt && (
                <span className="flex items-center gap-1.5">
                  Duration: {formatDuration(run.startedAt, run.completedAt)}
                </span>
              )}
            </div>

            {run.currentStep && (
              <p className="text-xs text-muted-foreground mt-2">
                Step: <span className="font-medium text-foreground">{run.currentStep}</span>
              </p>
            )}

            {run.errorMessage && (
              <div
                role="alert"
                className="mt-3 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive"
              >
                <span>{run.errorMessage}</span>
              </div>
            )}
          </div>

          {/* Refresh */}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => void refresh()}
            aria-label="Refresh run details"
            className="shrink-0"
          >
            <RefreshCw className={cn('h-4 w-4', isActive && 'animate-spin')} />
          </Button>
        </div>

        {/* Progress bar */}
        {(isActive || progressPct > 0) && (
          <div className="relative z-10 mt-6">
            <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
              <span>{totalProcessed} of {run.eligibleJobCount} processed</span>
              <span className="font-semibold">{progressPct}%</span>
            </div>
            <Progress value={progressPct} className="h-2" />
          </div>
        )}
      </section>

      {/* ── Summary Metrics ────────────────────────────────────── */}
      <section aria-label="Run summary metrics">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <MetricCard label="Discovered" value={run.discoveredJobCount} />
          <MetricCard label="Eligible" value={run.eligibleJobCount} />
          <MetricCard label="Submitted" value={run.submittedCount} accent="positive" />
          <MetricCard label="Blocked / Failed" value={run.blockedCount + run.failedCount} accent={run.blockedCount + run.failedCount > 0 ? 'negative' : undefined} />
        </div>
      </section>

      {/* ── Applications Table ─────────────────────────────────── */}
      <section aria-labelledby="applications-heading">
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle id="applications-heading" className="flex items-center gap-2">
                <Building2 className="h-5 w-5 text-primary" aria-hidden="true" />
                Applications ({applications.length})
              </CardTitle>
            </div>
          </CardHeader>

          <CardContent className="p-0">
            {applications.length === 0 ? (
              <div className="p-12 text-center">
                <Building2 className="h-8 w-8 text-muted-foreground/40 mx-auto mb-3" aria-hidden="true" />
                <p className="text-sm font-medium text-muted-foreground">
                  {isActive ? 'Applications will appear here as they are processed.' : 'No applications were created during this run.'}
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Job Title</TableHead>
                    <TableHead>Company</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Artifacts</TableHead>
                    <TableHead className="w-[50px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {applications.map((entry) => (
                    <TableRow key={entry.run.id}>
                      <TableCell className="font-medium max-w-[220px] truncate">
                        {entry.job.title}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {entry.job.companyName}
                      </TableCell>
                      <TableCell>
                        <Badge variant={statusVariant(entry.run.status)} className="capitalize">
                          {entry.run.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          {entry.resumeArtifact && (
                            <ArtifactDownloadButton
                              artifactId={entry.resumeArtifact.id}
                              label="Resume"
                            />
                          )}
                          {entry.coverLetterArtifact && (
                            <ArtifactDownloadButton
                              artifactId={entry.coverLetterArtifact.id}
                              label="Cover Letter"
                            />
                          )}
                          {!entry.resumeArtifact && !entry.coverLetterArtifact && (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
                          <Link
                            to={`/applications/${entry.run.id}`}
                            aria-label={`View application details for ${entry.job.title}`}
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

/* ── Inline Artifact Download Button ──────────────────────────── */

function ArtifactDownloadButton({ artifactId, label }: { artifactId: string; label: string }) {
  const handleDownload = async () => {
    try {
      const url = await buildArtifactFileUrl(artifactId, true);
      const a = document.createElement('a');
      a.href = url;
      a.target = '_blank';
      a.click();
    } catch {
      toast.error(`Failed to download ${label}`);
    }
  };

  return (
    <Button
      variant="ghost"
      size="sm"
      className="h-7 text-xs gap-1.5 px-2"
      onClick={handleDownload}
      aria-label={`Download ${label}`}
    >
      <Download className="h-3 w-3" aria-hidden="true" />
      {label}
    </Button>
  );
}
