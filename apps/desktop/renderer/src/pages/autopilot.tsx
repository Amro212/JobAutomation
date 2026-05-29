import { useEffect, useState } from 'react';

import { getAutopilotRuns, getAutopilotSettings } from '@renderer/lib/api';

export function AutopilotPage() {
  const [settings, setSettings] = useState<string>('Loading settings...');
  const [runs, setRuns] = useState<Array<{ id: string; status: string; step: string }>>([]);

  useEffect(() => {
    void Promise.all([getAutopilotSettings(), getAutopilotRuns()]).then(
      ([settingsResponse, runsResponse]) => {
        setSettings(
          `Mode: ${settingsResponse.settings.config.artifactMode} · Max jobs: ${settingsResponse.settings.config.maxJobsPerRun ?? 'unbounded'}`
        );
        setRuns(
          runsResponse.runs.slice(0, 6).map((entry) => ({
            id: entry.run.id,
            status: entry.run.status,
            step: entry.run.currentStep
          }))
        );
      }
    );
  }, []);

  return (
    <div className="grid">
      <section className="hero">
        <h1 className="section-title">Autopilot</h1>
        <p className="section-copy">
          Electron renderer shell is connected to the existing API surface. Full control and tray-aware actions land in follow-up commits.
        </p>
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
                    <td>{run.id.slice(0, 8)}</td>
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
