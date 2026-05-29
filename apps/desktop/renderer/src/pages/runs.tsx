import { useEffect, useState } from 'react';
import { Link } from 'react-router';

import { getDiscoveryRuns } from '@renderer/lib/api';

export function RunsPage() {
  const [runs, setRuns] = useState<Array<{ id: string; status: string; sourceKind: string }>>([]);

  useEffect(() => {
    void getDiscoveryRuns().then((response) => {
      setRuns(
        response.runs.slice(0, 12).map((run) => ({
          id: run.id,
          status: run.status,
          sourceKind: run.sourceKind
        }))
      );
    });
  }, []);

  return (
    <div className="grid">
      <section className="hero">
        <h1 className="section-title">Runs</h1>
        <p className="section-copy">
          Discovery run history is now a first-class desktop route with direct links into run detail.
        </p>
      </section>

      <section className="card">
        {runs.length === 0 ? (
          <p className="section-copy">No discovery runs recorded yet.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Run</th>
                <th>Source</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => (
                <tr key={run.id}>
                  <td>
                    <Link className="table-link" to={`/runs/${run.id}`}>
                      {run.id.slice(0, 8)}
                    </Link>
                  </td>
                  <td>{run.sourceKind}</td>
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
