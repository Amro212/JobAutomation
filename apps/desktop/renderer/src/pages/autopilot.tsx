import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';

import type { AutopilotConfigInput, AutopilotSettingsRecord } from '@jobautomation/core';
import {
  cancelAutopilotRun,
  createAutopilotRun,
  getAutopilotRuns,
  getAutopilotSettings,
  updateAutopilotSettings
} from '@renderer/lib/api';
import { useCamoufoxStatus } from '@renderer/lib/use-camoufox-status';
import { Button } from '@renderer/components/ui/button';
import { TextField } from '@renderer/components/ui/textfield';
import { Select, SelectItem } from '@renderer/components/ui/select';
import { Checkbox } from '@renderer/components/ui/checkbox';

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
    maxJobsPerRun: settings.config.maxJobsPerRun == null ? '' : String(settings.config.maxJobsPerRun),
    discoveryCacheHours: String(settings.config.discoveryCacheHours),
    matchProfile: settings.config.matchProfile ?? '',
    forceFreshDiscovery: settings.config.forceFreshDiscovery
  };
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

  const settingsSummary = useMemo(() => {
    if (!settings) {
      return 'Loading settings...';
    }

    return `Mode: ${settings.config.artifactMode} | Max jobs: ${settings.config.maxJobsPerRun ?? 'unbounded'} | Discovery cache: ${settings.config.discoveryCacheHours}h`;
  }, [settings]);

  const refresh = async () => {
    const [settingsResponse, runsResponse] = await Promise.all([
      getAutopilotSettings(),
      getAutopilotRuns()
    ]);

    setSettings(settingsResponse);
    setFormState(formStateFromSettings(settingsResponse));

    const nextRuns = runsResponse.slice(0, 6).map((entry) => ({
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
    void refresh().catch((error) => {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to load autopilot.');
    });
  }, []);

  useEffect(() => {
    if (!activeRun) {
      return;
    }

    const intervalId = window.setInterval(() => {
      void refresh().catch(() => null);
    }, 5_000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [activeRun]);

  const handleStart = async () => {
    setSubmitting(true);
    setErrorMessage(null);
    try {
      await createAutopilotRun();
      await refresh();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to start autopilot.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleStop = async () => {
    if (!activeRun) {
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);
    try {
      await cancelAutopilotRun(activeRun.id);
      await refresh();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to stop autopilot.');
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
          formState.maxJobsPerRun.trim().length === 0
            ? null
            : Number(formState.maxJobsPerRun),
        matchProfile: formState.matchProfile === '' ? null : formState.matchProfile,
        forceFreshDiscovery: formState.forceFreshDiscovery
      };
      const updated = await updateAutopilotSettings(payload);
      setSettings(updated);
      setFormState(formStateFromSettings(updated));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to save settings.');
    } finally {
      setSubmitting(false);
    }
  };

  const camoufoxReady = camoufoxStatus.state === 'ready';
  const startDisabled = submitting || Boolean(activeRun) || !camoufoxReady;

  return (
    <div className="flex flex-col gap-6">
      <section className="p-8 rounded-[2rem] border border-border bg-card/60 backdrop-blur-3xl shadow-[0_20px_60px_rgba(2,6,23,0.32)]">
        <h1 className="text-2xl font-semibold mb-2">Autopilot</h1>
        <p className="text-muted-foreground mb-6">
          Desktop controls now hit the same Fastify routes as the current dashboard. Active runs auto-refresh while automation is in flight.
        </p>
        <div className="flex flex-wrap gap-3">
          <Button
            variant="default"
            onPress={handleStart}
            isDisabled={startDisabled}
          >
            Start Autopilot
          </Button>
          <Button
            variant="secondary"
            onPress={handleStop}
            isDisabled={submitting || !activeRun}
          >
            Stop Active Run
          </Button>
          <Button variant="ghost" onPress={() => void refresh()} isDisabled={submitting}>
            Refresh
          </Button>
          <Link className="inline-flex items-center justify-center gap-2 rounded-xl text-sm font-medium transition-colors hover:bg-white/10 hover:text-accent-foreground h-10 px-4 py-2" to="/autopilot-runs">
            View History
          </Link>
        </div>
        {!camoufoxReady ? (
          <p className="mt-6 text-sm text-amber-500/90 font-medium bg-amber-500/10 px-4 py-3 rounded-xl border border-amber-500/20 w-fit">
            Autopilot stays locked until Camoufox finishes setup.
          </p>
        ) : null}
        {errorMessage ? <p className="mt-6 text-sm text-destructive font-medium bg-destructive/10 px-4 py-3 rounded-xl border border-destructive/20 w-fit">{errorMessage}</p> : null}
      </section>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <section className="p-6 rounded-3xl border border-border bg-card/55 backdrop-blur-[18px]">
          <h2 className="text-xl font-semibold mb-2">Launch profile</h2>
          <p className="text-sm text-muted-foreground mb-6">{settingsSummary}</p>

          <div className="grid gap-4">
            <label className="flex flex-col gap-2">
              <Select
                label="Artifact mode"
                selectedKey={formState.artifactMode}
                onSelectionChange={(key) =>
                  setFormState((current) => ({
                    ...current,
                    artifactMode: key as AutopilotFormState['artifactMode']
                  }))
                }
              >
                <SelectItem id="both">Both</SelectItem>
                <SelectItem id="resume">Resume only</SelectItem>
                <SelectItem id="cover-letter">Cover letter only</SelectItem>
              </Select>
            </label>
            <label className="flex flex-col gap-2">
              <TextField
                label="Max jobs per run"
                value={formState.maxJobsPerRun}
                onChange={(value) =>
                  setFormState((current) => ({
                    ...current,
                    maxJobsPerRun: value
                  }))
                }
                placeholder="Unlimited"
              />
            </label>
            <label className="flex flex-col gap-2">
              <TextField
                label="Discovery cache hours"
                value={formState.discoveryCacheHours}
                onChange={(value) =>
                  setFormState((current) => ({
                    ...current,
                    discoveryCacheHours: value
                  }))
                }
              />
            </label>
            <label className="flex flex-col gap-2">
              <Select
                label="Match profile"
                selectedKey={formState.matchProfile}
                onSelectionChange={(key) =>
                  setFormState((current) => ({
                    ...current,
                    matchProfile: key as AutopilotFormState['matchProfile']
                  }))
                }
              >
                <SelectItem id="">Default</SelectItem>
                <SelectItem id="me">Prefilter pass only</SelectItem>
                <SelectItem id="all">All jobs</SelectItem>
              </Select>
            </label>
            <label className="flex items-center gap-3 mt-2">
              <Checkbox
                isSelected={formState.forceFreshDiscovery}
                onChange={(isSelected) =>
                  setFormState((current) => ({
                    ...current,
                    forceFreshDiscovery: isSelected
                  }))
                }
              >
                Force fresh discovery before launch
              </Checkbox>
            </label>
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <Button variant="secondary" onPress={handleSaveSettings} isDisabled={submitting}>
              Save Settings
            </Button>
          </div>
        </section>

        <section className="p-6 rounded-3xl border border-border bg-card/55 backdrop-blur-[18px]">
          <h2 className="text-xl font-semibold mb-6">Active status</h2>
          {activeRun ? (
            <div className="flex flex-col gap-6">
              <p className="text-sm text-muted-foreground">
                Run <span className="font-mono text-sky-400">{activeRun.id.slice(0, 8)}</span> | {activeRun.status} | {activeRun.step}
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                <div className="flex flex-col gap-1 p-4 rounded-2xl border border-border bg-card/50">
                  <strong className="text-xl">{activeRun.discovered}</strong>
                  <span className="text-xs text-muted-foreground uppercase tracking-wider">Discovered</span>
                </div>
                <div className="flex flex-col gap-1 p-4 rounded-2xl border border-border bg-card/50">
                  <strong className="text-xl">{activeRun.eligible}</strong>
                  <span className="text-xs text-muted-foreground uppercase tracking-wider">Eligible</span>
                </div>
                <div className="flex flex-col gap-1 p-4 rounded-2xl border border-border bg-card/50">
                  <strong className="text-xl">{activeRun.submitted}</strong>
                  <span className="text-xs text-muted-foreground uppercase tracking-wider">Submitted</span>
                </div>
                <div className="flex flex-col gap-1 p-4 rounded-2xl border border-border bg-card/50">
                  <strong className="text-xl">{activeRun.blocked}</strong>
                  <span className="text-xs text-muted-foreground uppercase tracking-wider">Blocked</span>
                </div>
                <div className="flex flex-col gap-1 p-4 rounded-2xl border border-border bg-card/50">
                  <strong className="text-xl">{activeRun.failed}</strong>
                  <span className="text-xs text-muted-foreground uppercase tracking-wider">Failed</span>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground mb-8">No active autopilot run.</p>
          )}

          <h2 className="text-xl font-semibold mt-10 mb-6">Recent runs</h2>
          {runs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No autopilot runs recorded yet.</p>
          ) : (
            <div className="w-full overflow-hidden rounded-2xl border border-border">
              <table className="w-full text-sm text-left">
                <thead className="bg-card/40 text-muted-foreground text-xs uppercase tracking-wider border-b border-border">
                  <tr>
                    <th className="px-4 py-3 font-medium">Run</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Step</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {runs.map((run) => (
                    <tr key={run.id} className="hover:bg-white/5 transition-colors">
                      <td className="px-4 py-3">
                        <Link className="text-sky-400 hover:text-sky-300 transition-colors font-mono" to={`/autopilot-runs/${run.id}`}>
                          {run.id.slice(0, 8)}
                        </Link>
                      </td>
                      <td className="px-4 py-3">{run.status}</td>
                      <td className="px-4 py-3">{run.step}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
