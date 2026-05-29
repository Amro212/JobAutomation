import { useEffect, useState } from 'react';
import { useParams } from 'react-router';

import { getJob } from '@renderer/lib/api';

export function JobDetailPage() {
  const { jobId = '' } = useParams();
  const [job, setJob] = useState<Awaited<ReturnType<typeof getJob>>>(null);

  useEffect(() => {
    void getJob(jobId).then(setJob);
  }, [jobId]);

  if (!job) {
    return (
      <section className="card">
        <p className="section-copy">Job not found.</p>
      </section>
    );
  }

  return (
    <div className="grid">
      <section className="hero">
        <h1 className="section-title">{job.title}</h1>
        <p className="section-copy">
          {job.companyName} | {job.location || 'Unspecified'} | {job.status}
        </p>
      </section>

      <section className="card">
        <h2 className="section-title">Description</h2>
        <p className="preformatted-copy">{job.descriptionText || 'No description captured.'}</p>
      </section>
    </div>
  );
}
