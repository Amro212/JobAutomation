import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';

import { getAutopilotRun } from '@renderer/lib/api';

export function AutopilotRunDetailPage() {
  const { runId = '' } = useParams();
  const [detail, setDetail] = useState<Awaited<ReturnType<typeof getAutopilotRun>>>(null);

  useEffect(() => {
    void getAutopilotRun(runId).then(setDetail);
  }, [runId]);

  if (!detail) {
    return (
      <section className="p-6 rounded-3xl border border-border bg-card/55 backdrop-blur-[18px]">
        <p className="text-sm text-muted-foreground mb-6">Autopilot run not found.</p>
      </section>
    );
  }

  return (
    <div className="grid">
      <section className="p-8 rounded-[2rem] border border-border bg-card/60 backdrop-blur-3xl shadow-[0_20px_60px_rgba(2,6,23,0.32)]">
        <h1 className="text-xl font-semibold mb-2">Autopilot Run {detail.run.id.slice(0, 8)}</h1>
        <p className="text-sm text-muted-foreground mb-6">
          Status: {detail.run.status} | Step: {detail.run.currentStep} | Submitted: {detail.run.submittedCount}
        </p>
      </section>

      <section className="p-6 rounded-3xl border border-border bg-card/55 backdrop-blur-[18px]">
        <h2 className="text-xl font-semibold mb-2">Applications</h2>
        {detail.applications.length === 0 ? (
          <p className="text-sm text-muted-foreground mb-6">No child application runs recorded.</p>
        ) : (
          <table className="w-full text-sm text-left">
            <thead>
              <tr>
                <th>Application</th>
                <th>Job</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {detail.applications.map((entry) => (
                <tr key={entry.run.id}>
                  <td>
                    <Link className="text-sky-400 hover:text-sky-300 transition-colors font-medium" to={`/applications/${entry.run.id}`}>
                      {entry.run.id.slice(0, 8)}
                    </Link>
                  </td>
                  <td>{entry.job.title}</td>
                  <td>{entry.run.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
