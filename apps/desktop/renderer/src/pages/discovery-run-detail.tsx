import { useEffect, useState } from 'react';
import { useParams } from 'react-router';

import { getDiscoveryRun } from '@renderer/lib/api';

export function DiscoveryRunDetailPage() {
  const { runId = '' } = useParams();
  const [detail, setDetail] = useState<Awaited<ReturnType<typeof getDiscoveryRun>>>(null);

  useEffect(() => {
    void getDiscoveryRun(runId).then(setDetail);
  }, [runId]);

  if (!detail) {
    return (
      <section className="card">
        <p className="section-copy">Discovery run not found.</p>
      </section>
    );
  }

  return (
    <div className="grid">
      <section className="hero">
        <h1 className="section-title">Discovery Run {detail.run.id.slice(0, 8)}</h1>
        <p className="section-copy">
          Status: {detail.run.status} | Source: {detail.run.sourceKind} | Logs: {detail.logs.length}
        </p>
      </section>

      <section className="card">
        <h2 className="section-title">Source summaries</h2>
        {detail.sourceSummaries.length === 0 ? (
          <p className="section-copy">No source summary rows recorded.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Source</th>
                <th>Company</th>
                <th>Discovered</th>
              </tr>
            </thead>
            <tbody>
              {detail.sourceSummaries.map((summary) => (
                <tr key={`${summary.sourceKind}-${summary.sourceId}`}>
                  <td>{summary.sourceKind}</td>
                  <td>{summary.companyName}</td>
                  <td>{summary.discoveredCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
