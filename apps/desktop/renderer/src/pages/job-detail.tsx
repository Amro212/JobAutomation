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
      <section className="p-6 rounded-3xl border border-border bg-card/55 backdrop-blur-[18px]">
        <p className="text-sm text-muted-foreground mb-6">Job not found.</p>
      </section>
    );
  }

  return (
    <div className="grid">
      <section className="p-8 rounded-[2rem] border border-border bg-card/60 backdrop-blur-3xl shadow-[0_20px_60px_rgba(2,6,23,0.32)]">
        <h1 className="text-xl font-semibold mb-2">{job.title}</h1>
        <p className="text-sm text-muted-foreground mb-6">
          {job.companyName} | {job.location || 'Unspecified'} | {job.status}
        </p>
      </section>

      <section className="p-6 rounded-3xl border border-border bg-card/55 backdrop-blur-[18px]">
        <h2 className="text-xl font-semibold mb-2">Description</h2>
        <p className="preformatted-copy">{job.descriptionText || 'No description captured.'}</p>
      </section>
    </div>
  );
}
