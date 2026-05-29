import { useEffect, useState } from 'react';

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
          Phase 1 desktop page wired to `/jobs`. Filtering and detail actions port next.
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
                  <td>{job.title}</td>
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
