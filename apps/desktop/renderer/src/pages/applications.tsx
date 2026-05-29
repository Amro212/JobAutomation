import { useEffect, useState } from 'react';

import { getApplicationRuns } from '@renderer/lib/api';

export function ApplicationsPage() {
  const [runs, setRuns] = useState<Array<{ id: string; title: string; status: string }>>([]);

  useEffect(() => {
    void getApplicationRuns().then((response) => {
      setRuns(
        response.runs.slice(0, 12).map((entry) => ({
          id: entry.run.id,
          title: entry.job.title,
          status: entry.run.status
        }))
      );
    });
  }, []);

  return (
    <div className="grid">
      <section className="hero">
        <h1 className="section-title">Applications</h1>
        <p className="section-copy">
          Separate application run history preserved in the desktop shell. Detail routing and job drill-down follow in later commits.
        </p>
      </section>

      <section className="card">
        {runs.length === 0 ? (
          <p className="section-copy">No application runs have been recorded yet.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Run</th>
                <th>Job</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => (
                <tr key={run.id}>
                  <td>{run.id.slice(0, 8)}</td>
                  <td>{run.title}</td>
                  <td>{run.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
