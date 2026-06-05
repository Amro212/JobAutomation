import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router';
import {
  ChevronLeft,
  Building2,
  MapPin,
  Clock,
  Download,
  FileText,
  ExternalLink,
  RefreshCw,
  CheckCircle2,
  Circle
} from 'lucide-react';
import { toast } from 'sonner';

import { buildArtifactFileUrl, getApplicationRun } from '@renderer/lib/api';
import type { ApplicationRunDetail } from '@renderer/lib/api';
import { AnimatedStatusIcon } from '@renderer/components/animated-status-icon';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
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

function statusIconVariant(status: string): 'completed' | 'failed' | 'running' {
  switch (status) {
    case 'completed':
      return 'completed';
    case 'failed':
    case 'cancelled':
    case 'blocked':
      return 'failed';
    default:
      return 'running';
  }
}

function statusLabel(status: string): string {
  switch (status) {
    case 'completed':
      return 'Application Submitted';
    case 'failed':
      return 'Application Failed';
    case 'cancelled':
      return 'Application Cancelled';
    case 'blocked':
      return 'Application Blocked';
    case 'running':
      return 'Application In Progress';
    case 'pending':
      return 'Application Queued';
    default:
      return status;
  }
}

/* ── Application Step Phases ──────────────────────────────────── */

const APPLICATION_PHASES = [
  { key: 'queued', label: 'Queued' },
  { key: 'generating', label: 'Generating Artifacts' },
  { key: 'navigating', label: 'Navigating to Form' },
  { key: 'filling', label: 'Filling Application' },
  { key: 'submitting', label: 'Submitting' },
  { key: 'completed', label: 'Complete' }
] as const;

function inferPhaseIndex(currentStep: string, status: string): number {
  if (status === 'completed') return APPLICATION_PHASES.length - 1;
  if (status === 'failed' || status === 'cancelled' || status === 'blocked') return -1;

  const step = currentStep.toLowerCase();
  if (step.includes('complet') || step.includes('submit')) return 4;
  if (step.includes('fill') || step.includes('form') || step.includes('apply')) return 3;
  if (step.includes('navigat') || step.includes('open') || step.includes('load')) return 2;
  if (step.includes('generat') || step.includes('artifact') || step.includes('resume') || step.includes('cover')) return 1;
  if (step.includes('queue') || step.includes('pend') || step.includes('init')) return 0;
  return 0;
}

function StepProgress({ currentStep, status }: { currentStep: string; status: string }) {
  const activeIndex = inferPhaseIndex(currentStep, status);
  const isFailed = status === 'failed' || status === 'cancelled' || status === 'blocked';

  return (
    <div className="flex items-center gap-0" role="list" aria-label="Application progress steps">
      {APPLICATION_PHASES.map((phase, i) => {
        const isCompleted = !isFailed && activeIndex >= i;
        const isCurrent = !isFailed && activeIndex === i && status !== 'completed';

        return (
          <div
            key={phase.key}
            className="flex items-center"
            role="listitem"
            aria-current={isCurrent ? 'step' : undefined}
          >
            {/* Step indicator */}
            <div className="flex flex-col items-center">
              <div
                className={cn(
                  'flex items-center justify-center h-7 w-7 rounded-full border-2 transition-colors',
                  isCompleted
                    ? 'border-emerald-500 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                    : isCurrent
                      ? 'border-primary bg-primary/10 text-primary animate-pulse'
                      : 'border-border bg-muted/50 text-muted-foreground'
                )}
              >
                {isCompleted && !isCurrent ? (
                  <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <Circle className="h-3 w-3" aria-hidden="true" />
                )}
              </div>
              <span
                className={cn(
                  'text-[10px] font-semibold mt-1.5 whitespace-nowrap',
                  isCompleted
                    ? 'text-emerald-700 dark:text-emerald-400'
                    : isCurrent
                      ? 'text-primary'
                      : 'text-muted-foreground/60'
                )}
              >
                {phase.label}
              </span>
            </div>

            {/* Connector line */}
            {i < APPLICATION_PHASES.length - 1 && (
              <div
                className={cn(
                  'h-0.5 w-6 sm:w-10 mx-1 rounded-full transition-colors',
                  isCompleted && activeIndex > i
                    ? 'bg-emerald-500/50'
                    : 'bg-border'
                )}
                aria-hidden="true"
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ── Main Page Component ──────────────────────────────────────── */

export function ApplicationDetailPage() {
  const { runId = '' } = useParams();
  const navigate = useNavigate();
  const [detail, setDetail] = useState<ApplicationRunDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [resumeUrl, setResumeUrl] = useState<string | null>(null);
  const [coverLetterUrl, setCoverLetterUrl] = useState<string | null>(null);

  const refresh = async () => {
    setLoading(true);
    try {
      const data = await getApplicationRun(runId);
      if (!data) {
        setNotFound(true);
      } else {
        setDetail(data);
        setNotFound(false);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load application details');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, [runId]);

  // Resolve artifact URLs
  useEffect(() => {
    if (!detail) return;
    void Promise.all([
      detail.resumeArtifact ? buildArtifactFileUrl(detail.resumeArtifact.id, true) : null,
      detail.coverLetterArtifact ? buildArtifactFileUrl(detail.coverLetterArtifact.id, true) : null
    ]).then(([nextResumeUrl, nextCoverLetterUrl]) => {
      setResumeUrl(nextResumeUrl);
      setCoverLetterUrl(nextCoverLetterUrl);
    });
  }, [detail]);

  // Auto-refresh while active
  useEffect(() => {
    if (!detail || (detail.run.status !== 'running' && detail.run.status !== 'pending')) return;
    const id = window.setInterval(() => void refresh(), 4_000);
    return () => window.clearInterval(id);
  }, [detail?.run.status]);

  /* ── Loading State ──────────────────────────────────────────── */
  if (loading && !detail) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-44 w-full rounded-2xl" />
        <Skeleton className="h-20 w-full rounded-xl" />
        <Skeleton className="h-32 w-full rounded-xl" />
      </div>
    );
  }

  /* ── Not Found State ────────────────────────────────────────── */
  if (notFound) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <AnimatedStatusIcon variant="failed" size={48} className="mb-4" />
        <h2 className="font-headline text-xl font-semibold mb-2">Application Not Found</h2>
        <p className="text-sm text-muted-foreground mb-6">
          The application run you are looking for does not exist or has been removed.
        </p>
        <Button variant="outline" onClick={() => navigate('/applications')}>
          <ChevronLeft className="h-4 w-4 mr-2" aria-hidden="true" />
          Back to Applications
        </Button>
      </div>
    );
  }

  if (!detail) return null;

  const { run, job } = detail;
  const isActive = run.status === 'running' || run.status === 'pending';

  return (
    <div className="space-y-6">
      {/* ── Job Header + Status Banner ─────────────────────────── */}
      <section
        className="relative overflow-hidden rounded-2xl border border-border bg-card/60 backdrop-blur-xl p-8"
        aria-labelledby="application-heading"
      >
        {/* Decorative gradient */}
        <div className="absolute -top-20 -right-20 w-52 h-52 bg-primary/5 rounded-full blur-3xl pointer-events-none" aria-hidden="true" />

        <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center gap-6">
          {/* Back button */}
          <Button
            variant="outline"
            size="icon"
            onClick={() => navigate(-1)}
            className="rounded-xl shrink-0"
            aria-label="Go back"
          >
            <ChevronLeft className="h-5 w-5" />
          </Button>

          {/* Status icon */}
          <AnimatedStatusIcon variant={statusIconVariant(run.status)} size={52} />

          {/* Job info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-1">
              <h1
                id="application-heading"
                className="font-headline text-2xl font-semibold tracking-tight text-foreground truncate"
              >
                {job.title}
              </h1>
              <Badge
                variant={statusVariant(run.status)}
                className={cn('capitalize shrink-0', isActive && 'animate-pulse')}
              >
                {run.status}
              </Badge>
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <Building2 className="h-3.5 w-3.5" aria-hidden="true" />
                {job.companyName}
              </span>
              {job.location && (
                <span className="flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
                  {job.location}
                </span>
              )}
              <span className="flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                {formatDate(run.createdAt)}
              </span>
              {run.startedAt && (
                <span>
                  Duration: {formatDuration(run.startedAt, run.completedAt)}
                </span>
              )}
            </div>

            {/* Status label */}
            <p className="text-sm font-medium text-foreground mt-2">
              {statusLabel(run.status)}
            </p>

            {run.stopReason && (
              <div
                role="alert"
                className="mt-3 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive"
              >
                <span>{run.stopReason}</span>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 shrink-0">
            {job.sourceUrl && (
              <Button variant="outline" size="sm" asChild>
                <a
                  href={job.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`View job posting for ${job.title}`}
                >
                  <ExternalLink className="h-3.5 w-3.5 mr-1.5" aria-hidden="true" />
                  Posting
                </a>
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => void refresh()}
              aria-label="Refresh application details"
            >
              <RefreshCw className={cn('h-4 w-4', isActive && 'animate-spin')} />
            </Button>
          </div>
        </div>
      </section>

      {/* ── Step Progress ──────────────────────────────────────── */}
      <section aria-label="Application progress">
        <Card>
          <CardContent className="py-6 px-6 overflow-x-auto">
            <StepProgress currentStep={run.currentStep} status={run.status} />
            {isActive && run.currentStep && (
              <p className="text-xs text-muted-foreground mt-4 text-center">
                Current step: <span className="font-medium text-foreground">{run.currentStep}</span>
              </p>
            )}
          </CardContent>
        </Card>
      </section>

      {/* ── Artifacts ──────────────────────────────────────────── */}
      <section aria-labelledby="artifacts-heading">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle id="artifacts-heading" className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" aria-hidden="true" />
              Generated Artifacts
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!detail.resumeArtifact && !detail.coverLetterArtifact ? (
              <div className="py-8 text-center">
                <FileText className="h-8 w-8 text-muted-foreground/40 mx-auto mb-3" aria-hidden="true" />
                <p className="text-sm text-muted-foreground">
                  {isActive
                    ? 'Artifacts will appear here once they are generated.'
                    : 'No artifacts were generated for this application.'}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {detail.resumeArtifact && (
                  <ArtifactCard
                    label="Tailored Resume"
                    url={resumeUrl}
                    artifactId={detail.resumeArtifact.id}
                    fileName={detail.resumeArtifact.fileName}
                    createdAt={detail.resumeArtifact.createdAt}
                  />
                )}
                {detail.coverLetterArtifact && (
                  <ArtifactCard
                    label="Cover Letter"
                    url={coverLetterUrl}
                    artifactId={detail.coverLetterArtifact.id}
                    fileName={detail.coverLetterArtifact.fileName}
                    createdAt={detail.coverLetterArtifact.createdAt}
                  />
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      {/* ── Run Summary ────────────────────────────────────────── */}
      <section aria-label="Run summary">
        <Card>
          <CardContent className="py-5 px-6">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
              <span>
                Log entries: <span className="font-semibold text-foreground">{detail.logs.length}</span>
              </span>
              <Separator orientation="vertical" className="h-4" />
              <span>
                Artifacts: <span className="font-semibold text-foreground">{detail.artifacts.length}</span>
              </span>
              {run.siteKey && (
                <>
                  <Separator orientation="vertical" className="h-4" />
                  <span>
                    Platform: <span className="font-semibold text-foreground capitalize">{run.siteKey}</span>
                  </span>
                </>
              )}
              {run.autopilotRunId && (
                <>
                  <Separator orientation="vertical" className="h-4" />
                  <span className="flex items-center gap-1.5">
                    Autopilot run:
                    <Button variant="link" size="sm" className="h-auto p-0 text-sm" asChild>
                      <a href={`#/autopilot-runs/${run.autopilotRunId}`}>
                        {run.autopilotRunId.slice(0, 8)}
                      </a>
                    </Button>
                  </span>
                </>
              )}
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

/* ── Artifact Card ────────────────────────────────────────────── */

function ArtifactCard({
  label,
  url,
  artifactId,
  fileName,
  createdAt
}: {
  label: string;
  url: string | null;
  artifactId: string;
  fileName: string | null;
  createdAt: Date | string;
}) {
  const handleDownload = async () => {
    try {
      const downloadUrl = url ?? await buildArtifactFileUrl(artifactId, true);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.target = '_blank';
      a.click();
    } catch {
      toast.error(`Failed to download ${label}`);
    }
  };

  const displayName = fileName || `${label.replace(/\s+/g, '_').toLowerCase()}.pdf`;
  const dateStr = createdAt instanceof Date
    ? createdAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    : new Date(createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

  return (
    <div className="flex items-center gap-4 rounded-xl border border-border bg-muted/30 p-4 hover:bg-muted/50 transition-colors">
      <div className="flex items-center justify-center h-11 w-11 rounded-lg bg-primary/10 text-primary shrink-0">
        <FileText className="h-5 w-5" aria-hidden="true" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-foreground truncate">{displayName}</p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-[10px] px-2 py-0.5 rounded uppercase tracking-wider font-semibold bg-primary/10 text-primary">
            {label}
          </span>
          <span className="text-xs text-muted-foreground">{dateStr}</span>
        </div>
      </div>
      <Button
        variant="outline"
        size="sm"
        className="shrink-0 gap-1.5"
        onClick={handleDownload}
        aria-label={`Download ${label}`}
      >
        <Download className="h-3.5 w-3.5" aria-hidden="true" />
        Download
      </Button>
    </div>
  );
}
