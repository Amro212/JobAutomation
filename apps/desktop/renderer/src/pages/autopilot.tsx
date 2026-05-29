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

  return (
    <div className="grid">
      <section className="hero">
        <h1 className="section-title">Autopilot</h1>
        <p className="section-copy">
          Desktop controls now hit the same Fastify routes as the current dashboard. Active runs auto-refresh while automation is in flight.
        </p>
        <div className="inline-actions">
          <button
            className="button primary"
            onClick={handleStart}
            disabled={submitting || Boolean(activeRun)}
          >
            Start Autopilot
          </button>
          <button
            className="button"
            onClick={handleStop}
            disabled={submitting || !activeRun}
          >
            Stop Active Run
          </button>
          <button className="button ghost" onClick={() => void refresh()} disabled={submitting}>
            Refresh
          </button>
          <Link className="button ghost" to="/autopilot-runs">
            View History
          </Link>
        </div>
        {errorMessage ? <p className="error-copy">{errorMessage}</p> : null}
      </section>

      <div className="grid two">
        <section className="card">
          <h2 className="section-title">Launch profile</h2>
          <p className="section-copy">{settingsSummary}</p>

          <div className="form-grid">
            <label className="field">
              <span className="label-copy">Artifact mode</span>
              <select
                className="input"
                value={formState.artifactMode}
                onChange={(event) =>
                  setFormState((current) => ({
                    ...current,
                    artifactMode: event.target.value as AutopilotFormState['artifactMode']
                  }))
                }
              >
                <option value="both">Both</option>
                <option value="resume">Resume only</option>
                <option value="cover-letter">Cover letter only</option>
              </select>
            </label>
            <label className="field">
              <span className="label-copy">Max jobs per run</span>
              <input
                className="input"
                value={formState.maxJobsPerRun}
                onChange={(event) =>
                  setFormState((current) => ({
                    ...current,
                    maxJobsPerRun: event.target.value
                  }))
                }
                placeholder="Unlimited"
              />
            </label>
            <label className="field">
              <span className="label-copy">Discovery cache hours</span>
              <input
                className="input"
                value={formState.discoveryCacheHours}
                onChange={(event) =>
                  setFormState((current) => ({
                    ...current,
                    discoveryCacheHours: event.target.value
                  }))
                }
              />
            </label>
            <label className="field">
              <span className="label-copy">Match profile</span>
              <select
                className="input"
                value={formState.matchProfile}
                onChange={(event) =>
                  setFormState((current) => ({
                    ...current,
                    matchProfile: event.target.value as AutopilotFormState['matchProfile']
                  }))
                }
              >
                <option value="">Default</option>
                <option value="me">Prefilter pass only</option>
                <option value="all">All jobs</option>
              </select>
            </label>
            <label className="field checkbox-field">
              <input
                type="checkbox"
                checked={formState.forceFreshDiscovery}
                onChange={(event) =>
                  setFormState((current) => ({
                    ...current,
                    forceFreshDiscovery: event.target.checked
                  }))
                }
              />
              <span className="label-copy">Force fresh discovery before launch</span>
            </label>
          </div>

          <div className="inline-actions">
            <button className="button" onClick={handleSaveSettings} disabled={submitting}>
              Save Settings
            </button>
          </div>
        </section>

        <section className="card">
          <h2 className="section-title">Active status</h2>
          {activeRun ? (
            <div className="grid">
              <p className="section-copy">
                Run {activeRun.id.slice(0, 8)} | {activeRun.status} | {activeRun.step}
              </p>
              <div className="metrics-grid">
                <div className="metric-card">
                  <strong>{activeRun.discovered}</strong>
                  <span className="muted">Discovered</span>
                </div>
                <div className="metric-card">
                  <strong>{activeRun.eligible}</strong>
                  <span className="muted">Eligible</span>
                </div>
                <div className="metric-card">
                  <strong>{activeRun.submitted}</strong>
                  <span className="muted">Submitted</span>
                </div>
                <div className="metric-card">
                  <strong>{activeRun.blocked}</strong>
                  <span className="muted">Blocked</span>
                </div>
                <div className="metric-card">
                  <strong>{activeRun.failed}</strong>
                  <span className="muted">Failed</span>
                </div>
              </div>
            </div>
          ) : (
            <p className="section-copy">No active autopilot run.</p>
          )}

          <h2 className="section-title">Recent runs</h2>
          {runs.length === 0 ? (
            <p className="section-copy">No autopilot runs recorded yet.</p>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Run</th>
                  <th>Status</th>
                  <th>Step</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((run) => (
                  <tr key={run.id}>
                    <td>
                      <Link className="table-link" to={`/autopilot-runs/${run.id}`}>
                        {run.id.slice(0, 8)}
                      </Link>
                    </td>
                    <td>{run.status}</td>
                    <td>{run.step}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </div>
  );
}
