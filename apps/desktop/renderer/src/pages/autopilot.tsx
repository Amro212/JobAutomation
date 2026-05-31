import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import {
  Zap,
  Square,
  Save,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Clock,
  Settings
} from 'lucide-react';
import { toast } from 'sonner';

import type { AutopilotConfigInput, AutopilotSettingsRecord } from '@jobautomation/core';
import {
  cancelAutopilotRun,
  createAutopilotRun,
  getAutopilotRuns,
  getAutopilotSettings,
  updateAutopilotSettings
} from '@renderer/lib/api';
import { useCamoufoxStatus } from '@renderer/lib/use-camoufox-status';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { cn } from '@renderer/lib/utils';

type AutopilotFormState = {
  artifactMode: 'both' | 'resume' | 'cover-letter';
  maxJobsPerRun: string;
  discoveryCacheHours: string;
  matchProfile: '' | 'me' | 'all';
  forceFreshDiscovery: boolean;
};

function formStateFromSettings(settings: AutopilotSettingsRecord): AutopilotFormState {
  return {
    artifactMode: settings.config.artifactMode,
    maxJobsPerRun:
      settings.config.maxJobsPerRun == null ? '' : String(settings.config.maxJobsPerRun),
    discoveryCacheHours: String(settings.config.discoveryCacheHours),
    matchProfile: settings.config.matchProfile ?? '',
    forceFreshDiscovery: settings.config.forceFreshDiscovery
  };
}

function statusVariant(status: string): 'success' | 'destructive' | 'warning' | 'outline' {
  switch (status) {
    case 'completed':
      return 'success';
    case 'failed':
    case 'cancelled':
      return 'destructive';
    case 'running':
    case 'pending':
      return 'warning';
    default:
      return 'outline';
  }
}

export function AutopilotPage() {
  const { status: camoufoxStatus } = useCamoufoxStatus();
  const [settings, setSettings] = useState<AutopilotSettingsRecord | null>(null);
  const [formState, setFormState] = useState<AutopilotFormState>({
    artifactMode: 'both',
    maxJobsPerRun: '',
    discoveryCacheHours: '3',
    matchProfile: '',
    forceFreshDiscovery: false
  });
  const [runs, setRuns] = useState<Array<{ id: string; status: string; step: string }>>([]);
  const [activeRun, setActiveRun] = useState<{
    id: string;
    status: string;
    step: string;
    discovered: number;
    eligible: number;
    submitted: number;
    blocked: number;
    failed: number;
  } | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);

  const settingsSummary = useMemo(() => {
    if (!settings) return 'Loading settings...';
    return `Mode: ${settings.config.artifactMode} | Max: ${settings.config.maxJobsPerRun ?? '∞'} jobs | Cache: ${settings.config.discoveryCacheHours}h`;
  }, [settings]);

  const refresh = async () => {
    const [settingsResponse, runsResponse] = await Promise.all([
      getAutopilotSettings(),
      getAutopilotRuns()
    ]);
    setSettings(settingsResponse);
    setFormState(formStateFromSettings(settingsResponse));
    const nextRuns = runsResponse.slice(0, 8).map((entry) => ({
      id: entry.run.id,
      status: entry.run.status,
      step: entry.run.currentStep
    }));
    setRuns(nextRuns);
    const nextActiveRun = runsResponse.find(
      (entry) => entry.run.status === 'running' || entry.run.status === 'pending'
    )?.run;
    setActiveRun(
      nextActiveRun
        ? {
            id: nextActiveRun.id,
            status: nextActiveRun.status,
            step: nextActiveRun.currentStep,
            discovered: nextActiveRun.discoveredJobCount,
            eligible: nextActiveRun.eligibleJobCount,
            submitted: nextActiveRun.submittedCount,
            blocked: nextActiveRun.blockedCount,
            failed: nextActiveRun.failedCount
          }
        : null
    );
  };

  useEffect(() => {
    void refresh()
      .catch((err) => {
        setErrorMessage(err instanceof Error ? err.message : 'Failed to load autopilot.');
      })
      .finally(() => setInitialLoading(false));
  }, []);

  useEffect(() => {
    if (!activeRun) return;
    const id = window.setInterval(() => {
      void refresh().catch(() => null);
    }, 5_000);
    return () => window.clearInterval(id);
  }, [activeRun]);

  const handleStart = async () => {
    setSubmitting(true);
    setErrorMessage(null);
    try {
      await createAutopilotRun();
      await refresh();
      toast.success('Autopilot run started');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to start autopilot.';
      setErrorMessage(msg);
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleStop = async () => {
    if (!activeRun) return;
    setSubmitting(true);
    setErrorMessage(null);
    try {
      await cancelAutopilotRun(activeRun.id);
      await refresh();
      toast.success('Autopilot run cancelled');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to cancel run.';
      setErrorMessage(msg);
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaveSettings = async () => {
    setSubmitting(true);
    setErrorMessage(null);
    try {
      const payload: AutopilotConfigInput = {
        artifactMode: formState.artifactMode,
        discoveryCacheHours: Number(formState.discoveryCacheHours),
        maxJobsPerRun:
          formState.maxJobsPerRun.trim().length === 0 ? null : Number(formState.maxJobsPerRun),
        matchProfile: formState.matchProfile === '' ? null : formState.matchProfile,
        forceFreshDiscovery: formState.forceFreshDiscovery
      };
      const updated = await updateAutopilotSettings(payload);
      setSettings(updated);
      setFormState(formStateFromSettings(updated));
      toast.success('Settings saved');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to save settings.';
      setErrorMessage(msg);
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const camoufoxReady = camoufoxStatus.state === 'ready';
  const startDisabled = submitting || Boolean(activeRun) || !camoufoxReady;
  const totalDone = activeRun ? activeRun.submitted + activeRun.blocked + activeRun.failed : 0;
  const eligibleForProgress = activeRun?.eligible ?? 0;
  const progressPct =
    eligibleForProgress > 0 ? Math.round((totalDone / eligibleForProgress) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* Error Banner */}
      {errorMessage && (
        <div
          role="alert"
          className="flex items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          <AlertCircle className="h-4 w-4 shrink-0" />
          {errorMessage}
        </div>
      )}

      {/* Camoufox Warning */}
      {!camoufoxReady && (
        <div
          role="status"
          className="flex items-center gap-3 rounded-lg border border-amber-500/30 bg-amber-50 dark:bg-amber-950/20 px-4 py-3 text-sm text-amber-800 dark:text-amber-400"
        >
          <AlertCircle className="h-4 w-4 shrink-0" />
          Camoufox browser is not ready.{' '}
          <Link to="/setup" className="font-semibold underline underline-offset-2">
            Complete setup
          </Link>{' '}
          before launching autopilot.
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ── Left: Control Panel ───────────────────────────── */}
        <div className="lg:col-span-2 space-y-5">
          {/* Launch Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Zap className="h-5 w-5 text-primary" />
                Autopilot Control
              </CardTitle>
              <CardDescription>{settingsSummary}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-3">
                <Button
                  onClick={() => void handleStart()}
                  disabled={startDisabled}
                  className="gap-2"
                  id="autopilot-start-btn"
                >
                  <Zap className="h-4 w-4" />
                  {submitting && !activeRun ? 'Starting…' : 'Launch Autopilot'}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => void handleStop()}
                  disabled={submitting || !activeRun}
                  className="gap-2"
                  id="autopilot-stop-btn"
                >
                  <Square className="h-4 w-4" />
                  Stop Run
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => void refresh().catch(() => null)}
                  aria-label="Refresh autopilot status"
                >
                  <RefreshCw className="h-4 w-4" />
                </Button>
              </div>

              {/* Active Run Progress */}
              {activeRun && (
                <div className="mt-5 space-y-4">
                  <Separator />
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-foreground">
                        Run in progress
                      </span>
                      <Badge variant="warning" className="animate-pulse">
                        {activeRun.status}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mb-3">
                      Step: {activeRun.step ?? 'Initializing…'}
                    </p>
                    <Progress value={progressPct} className="h-2 mb-3" />
                    <div className="grid grid-cols-4 gap-3">
                      <MetricPill label="Discovered" value={activeRun.discovered} />
                      <MetricPill label="Eligible" value={activeRun.eligible} />
                      <MetricPill
                        label="Submitted"
                        value={activeRun.submitted}
                        positive
                      />
                      <MetricPill
                        label="Blocked"
                        value={activeRun.blocked}
                        negative
                      />
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Settings Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Settings className="h-4 w-4 text-muted-foreground" />
                Run Configuration
              </CardTitle>
            </CardHeader>
            <CardContent>
              {initialLoading ? (
                <div className="space-y-4">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="h-9 w-full" />
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  {/* Artifact Mode */}
                  <div className="space-y-1.5">
                    <Label htmlFor="artifact-mode">Artifact Mode</Label>
                    <Select
                      value={formState.artifactMode}
                      onValueChange={(v) =>
                        setFormState({
                          ...formState,
                          artifactMode: v as AutopilotFormState['artifactMode']
                        })
                      }
                    >
                      <SelectTrigger id="artifact-mode">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="both">Resume + Cover Letter</SelectItem>
                        <SelectItem value="resume">Resume Only</SelectItem>
                        <SelectItem value="cover-letter">Cover Letter Only</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Max Jobs */}
                  <div className="space-y-1.5">
                    <Label htmlFor="max-jobs">Max Jobs Per Run</Label>
                    <Input
                      id="max-jobs"
                      type="number"
                      min="1"
                      placeholder="Unlimited"
                      value={formState.maxJobsPerRun}
                      onChange={(e) =>
                        setFormState({ ...formState, maxJobsPerRun: e.target.value })
                      }
                    />
                  </div>

                  {/* Discovery Cache */}
                  <div className="space-y-1.5">
                    <Label htmlFor="discovery-cache">Discovery Cache (hours)</Label>
                    <Input
                      id="discovery-cache"
                      type="number"
                      min="0"
                      value={formState.discoveryCacheHours}
                      onChange={(e) =>
                        setFormState({ ...formState, discoveryCacheHours: e.target.value })
                      }
                    />
                  </div>

                  {/* Match Profile */}
                  <div className="space-y-1.5">
                    <Label htmlFor="match-profile">Match Profile</Label>
                    <Select
                      value={formState.matchProfile || 'any'}
                      onValueChange={(v) =>
                        setFormState({
                          ...formState,
                          matchProfile: (v === 'any' ? '' : v) as AutopilotFormState['matchProfile']
                        })
                      }
                    >
                      <SelectTrigger id="match-profile">
                        <SelectValue placeholder="Any" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="any">Any profile</SelectItem>
                        <SelectItem value="me">Match Me</SelectItem>
                        <SelectItem value="all">All profiles</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Force Fresh Discovery */}
                  <div className="col-span-full">
                    <div className="flex items-center gap-3">
                      <Checkbox
                        id="force-fresh"
                        checked={formState.forceFreshDiscovery}
                        onCheckedChange={(checked) =>
                          setFormState({ ...formState, forceFreshDiscovery: Boolean(checked) })
                        }
                      />
                      <Label htmlFor="force-fresh" className="cursor-pointer">
                        Force fresh discovery (ignore cache)
                      </Label>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex justify-end mt-5">
                <Button
                  onClick={() => void handleSaveSettings()}
                  disabled={submitting || initialLoading}
                  variant="outline"
                  size="sm"
                  className="gap-2"
                >
                  <Save className="h-4 w-4" />
                  Save Settings
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ── Right: Run History ────────────────────────────── */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Recent Runs</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {initialLoading ? (
                <div className="p-4 space-y-3">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : runs.length === 0 ? (
                <div className="p-8 text-center">
                  <p className="text-sm text-muted-foreground">No runs yet</p>
                </div>
              ) : (
                <ul className="divide-y divide-border">
                  {runs.map((run) => (
                    <li key={run.id}>
                      <Link
                        to={`/autopilot-runs/${run.id}`}
                        className="flex items-center justify-between px-4 py-3 hover:bg-muted/40 transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <RunStatusIcon status={run.status} />
                          <div>
                            <p className="text-xs font-mono text-muted-foreground">
                              {run.id.slice(0, 10)}…
                            </p>
                            {run.step && (
                              <p className="text-[11px] text-muted-foreground/70 mt-0.5 truncate max-w-[160px]">
                                {run.step}
                              </p>
                            )}
                          </div>
                        </div>
                        <Badge variant={statusVariant(run.status)} className="text-[10px] py-0.5">
                          {run.status}
                        </Badge>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}

              {runs.length > 0 && (
                <div className="px-4 py-3 border-t border-border">
                  <Button variant="ghost" size="sm" className="w-full text-xs" asChild>
                    <Link to="/autopilot-runs">View all runs</Link>
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

/* ── Helper Components ────────────────────────────────────────── */

function MetricPill({
  label,
  value,
  positive,
  negative
}: {
  label: string;
  value: number;
  positive?: boolean;
  negative?: boolean;
}) {
  return (
    <div className="flex flex-col items-center rounded-lg bg-muted/50 p-2.5 text-center">
      <span
        className={cn(
          'font-headline text-xl font-bold',
          positive && 'text-emerald-600 dark:text-emerald-400',
          negative && 'text-red-600 dark:text-red-400'
        )}
      >
        {value}
      </span>
      <span className="text-[10px] text-muted-foreground mt-0.5">{label}</span>
    </div>
  );
}

function RunStatusIcon({ status }: { status: string }) {
  switch (status) {
    case 'completed':
      return <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />;
    case 'failed':
    case 'cancelled':
      return <XCircle className="h-4 w-4 text-red-500 shrink-0" />;
    case 'running':
    case 'pending':
      return <RefreshCw className="h-4 w-4 text-amber-500 shrink-0 animate-spin" />;
    default:
      return <Clock className="h-4 w-4 text-muted-foreground shrink-0" />;
  }
}
