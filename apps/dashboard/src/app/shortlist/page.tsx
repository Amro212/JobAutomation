import { JobsTable } from '../../components/jobs/jobs-table';
import { getJobs } from '../../lib/api';

export default async function ShortlistPage() {
  const jobs = await getJobs({
    status: 'shortlisted'
  });

  return (
    <section className="space-y-6">
      <div>
        <p className="text-sm uppercase tracking-[0.24em] text-slate-500">Shortlist</p>
        <h2 className="mt-2 text-2xl font-semibold text-slate-900">
          Persisted shortlist workflow
        </h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Jobs moved into shortlisted state stay visible here until you send them back to
          reviewing or archive them.
        </p>
      </div>
      <JobsTable jobs={jobs} emptyMessage="No shortlisted jobs yet." />
    </section>
  );
}
