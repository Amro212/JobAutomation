import { useEffect, useState } from 'react';
import { Link } from 'react-router';

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
      <section className="p-8 rounded-[2rem] border border-border bg-card/60 backdrop-blur-3xl shadow-[0_20px_60px_rgba(2,6,23,0.32)]">
        <h1 className="text-xl font-semibold mb-2">Applications</h1>
        <p className="text-sm text-muted-foreground mb-6">
          Application runs and their artifacts stay attached to the same API records already used in production.
        </p>
      </section>

      <section className="p-6 rounded-3xl border border-border bg-card/55 backdrop-blur-[18px]">
        {runs.length === 0 ? (
          <p className="text-sm text-muted-foreground mb-6">No application runs have been recorded yet.</p>
        ) : (
          <table className="w-full text-sm text-left">
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
                  <td>
                    <Link className="text-sky-400 hover:text-sky-300 transition-colors font-medium" to={`/applications/${run.id}`}>
                      {run.id.slice(0, 8)}
                    </Link>
                  </td>
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
