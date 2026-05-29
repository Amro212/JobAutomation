import { useEffect, useState } from 'react';
import { Link } from 'react-router';

import { getJobs } from '@renderer/lib/api';

export function JobsPage() {
  const [jobs, setJobs] = useState<Array<{ id: string; title: string; company: string; location: string }>>([]);

  useEffect(() => {
    void getJobs().then((response) => {
      setJobs(
        response.jobs.slice(0, 12).map((job) => ({
          id: job.id,
          title: job.title,
          company: job.companyName,
          location: job.location
        }))
      );
    });
  }, []);

  return (
    <div className="grid">
      <section className="hero">
        <h1 className="section-title">Jobs</h1>
        <p className="section-copy">
          Jobs now drill into their existing API detail records, so review context stays consistent between the desktop shell and the current web dashboard.
        </p>
      </section>

      <section className="card">
        {jobs.length === 0 ? (
          <p className="section-copy">No jobs have been discovered yet.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Title</th>
                <th>Company</th>
                <th>Location</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => (
                <tr key={job.id}>
                  <td>
                    <Link className="table-link" to={`/jobs/${job.id}`}>
                      {job.title}
                    </Link>
                  </td>
                  <td>{job.company}</td>
                  <td>{job.location || 'Unspecified'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
