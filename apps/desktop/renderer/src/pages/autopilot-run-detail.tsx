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
      <section className="card">
        <p className="section-copy">Autopilot run not found.</p>
      </section>
    );
  }

  return (
    <div className="grid">
      <section className="hero">
        <h1 className="section-title">Autopilot Run {detail.run.id.slice(0, 8)}</h1>
        <p className="section-copy">
          Status: {detail.run.status} | Step: {detail.run.currentStep} | Submitted: {detail.run.submittedCount}
        </p>
      </section>

      <section className="card">
        <h2 className="section-title">Applications</h2>
        {detail.applications.length === 0 ? (
          <p className="section-copy">No child application runs recorded.</p>
        ) : (
          <table className="table">
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
                    <Link className="table-link" to={`/applications/${entry.run.id}`}>
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
