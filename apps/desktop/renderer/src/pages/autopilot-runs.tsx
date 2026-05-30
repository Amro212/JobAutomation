import { useEffect, useState } from 'react';
import { Link } from 'react-router';

import { getAutopilotRuns } from '@renderer/lib/api';

export function AutopilotRunsPage() {
  const [runs, setRuns] = useState<Array<{ id: string; status: string; submitted: number }>>([]);

  useEffect(() => {
    void getAutopilotRuns().then((response) => {
      setRuns(
        response.map((entry) => ({
          id: entry.run.id,
          status: entry.run.status,
          submitted: entry.run.submittedCount
        }))
      );
    });
  }, []);

  return (
    <div className="grid">
      <section className="p-8 rounded-[2rem] border border-border bg-card/60 backdrop-blur-3xl shadow-[0_20px_60px_rgba(2,6,23,0.32)]">
        <h1 className="text-xl font-semibold mb-2">Autopilot Runs</h1>
        <p className="text-sm text-muted-foreground mb-6">
          Batch history, statuses, and child application results stay available in the desktop shell.
        </p>
      </section>

      <section className="p-6 rounded-3xl border border-border bg-card/55 backdrop-blur-[18px]">
        {runs.length === 0 ? (
          <p className="text-sm text-muted-foreground mb-6">No autopilot runs recorded yet.</p>
        ) : (
          <table className="w-full text-sm text-left">
            <thead>
              <tr>
                <th>Run</th>
                <th>Status</th>
                <th>Submitted</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => (
                <tr key={run.id}>
                  <td>
                    <Link className="text-sky-400 hover:text-sky-300 transition-colors font-medium" to={`/autopilot-runs/${run.id}`}>
                      {run.id.slice(0, 8)}
                    </Link>
                  </td>
                  <td>{run.status}</td>
                  <td>{run.submitted}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
