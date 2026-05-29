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
      <section className="hero">
        <h1 className="section-title">Autopilot Runs</h1>
        <p className="section-copy">
          Batch history, statuses, and child application results stay available in the desktop shell.
        </p>
      </section>

      <section className="card">
        {runs.length === 0 ? (
          <p className="section-copy">No autopilot runs recorded yet.</p>
        ) : (
          <table className="table">
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
                    <Link className="table-link" to={`/autopilot-runs/${run.id}`}>
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
