import { JobsTable } from '../../components/jobs/jobs-table';
import { getJobs } from '../../lib/api';

export default async function JobsPage(): Promise<JSX.Element> {
  const jobs = await getJobs();

  return (
    <section className="space-y-4">
      <div>
        <p className="text-sm uppercase tracking-[0.24em] text-slate-500">Jobs</p>
        <h2 className="mt-2 text-2xl font-semibold text-slate-900">Structured discovery intake</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">This view reads persisted job rows from the API. Batch A should be empty until discovery starts.</p>
      </div>
      <JobsTable jobs={jobs} />
    </section>
  );
}
