import { useEffect, useState } from 'react';
import { Link } from 'react-router';

import {
  cancelAutopilotRun,
  createAutopilotRun,
  getAutopilotRuns,
  getAutopilotSettings
} from '@renderer/lib/api';

export function AutopilotPage() {
  const [settings, setSettings] = useState('Loading settings...');
  const [runs, setRuns] = useState<Array<{ id: string; status: string; step: string }>>([]);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const refresh = async () => {
    const [settingsResponse, runsResponse] = await Promise.all([
      getAutopilotSettings(),
      getAutopilotRuns()
    ]);

    setSettings(
      `Mode: ${settingsResponse.config.artifactMode} | Max jobs: ${settingsResponse.config.maxJobsPerRun ?? 'unbounded'} | Discovery cache: ${settingsResponse.config.discoveryCacheHours}h`
    );
    setRuns(
      runsResponse.slice(0, 6).map((entry) => ({
        id: entry.run.id,
        status: entry.run.status,
        step: entry.run.currentStep
      }))
    );
    setActiveRunId(
      runsResponse.find(
        (entry) => entry.run.status === 'running' || entry.run.status === 'pending'
      )?.run.id ?? null
    );
  };

  useEffect(() => {
    void refresh().catch((error) => {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to load autopilot.');
    });
  }, []);

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
    if (!activeRunId) {
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);
    try {
      await cancelAutopilotRun(activeRunId);
      await refresh();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to stop autopilot.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="grid">
      <section className="hero">
        <h1 className="section-title">Autopilot</h1>
        <p className="section-copy">
          Desktop controls now hit the same Fastify routes as the current dashboard. Start and stop remain attached to the existing run records.
        </p>
        <div className="inline-actions">
          <button
            className="button primary"
            onClick={handleStart}
            disabled={submitting || Boolean(activeRunId)}
          >
            Start Autopilot
          </button>
          <button
            className="button"
            onClick={handleStop}
            disabled={submitting || !activeRunId}
          >
            Stop Active Run
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
          <p className="section-copy">{settings}</p>
        </section>

        <section className="card">
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
