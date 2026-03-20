import { JobsTable } from '@/components/jobs/jobs-table';
import { getJobs } from '@/lib/api';

export default async function ShortlistPage() {
  const jobs = await getJobs({
    status: 'shortlisted'
  });

  return (
    <section className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Shortlist
        </p>
        <h2 className="mt-2 text-2xl font-semibold text-foreground">
          Persisted shortlist workflow
        </h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Jobs moved into shortlisted state stay visible here until you send them back to
          reviewing or archive them.
        </p>
      </div>
      <JobsTable jobs={jobs} emptyMessage="No shortlisted jobs yet." />
    </section>
  );
}
