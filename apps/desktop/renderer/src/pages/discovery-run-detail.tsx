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
      <section className="p-6 rounded-3xl border border-border bg-card/55 backdrop-blur-[18px]">
        <p className="text-sm text-muted-foreground mb-6">Discovery run not found.</p>
      </section>
    );
  }

  return (
    <div className="grid">
      <section className="p-8 rounded-[2rem] border border-border bg-card/60 backdrop-blur-3xl shadow-[0_20px_60px_rgba(2,6,23,0.32)]">
        <h1 className="text-xl font-semibold mb-2">Discovery Run {detail.run.id.slice(0, 8)}</h1>
        <p className="text-sm text-muted-foreground mb-6">
          Status: {detail.run.status} | Source: {detail.run.sourceKind} | Logs: {detail.logs.length}
        </p>
      </section>

      <section className="p-6 rounded-3xl border border-border bg-card/55 backdrop-blur-[18px]">
        <h2 className="text-xl font-semibold mb-2">Source summaries</h2>
        {detail.sourceSummaries.length === 0 ? (
          <p className="text-sm text-muted-foreground mb-6">No source summary rows recorded.</p>
        ) : (
          <table className="w-full text-sm text-left">
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
