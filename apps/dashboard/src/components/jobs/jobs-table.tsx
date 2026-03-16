import Link from 'next/link';

import type { JobRecord } from '@jobautomation/core';

export function JobsTable({
  jobs,
  emptyMessage = 'No jobs have been discovered yet.'
}: {
  jobs: JobRecord[];
  emptyMessage?: string;
}) {
  if (jobs.length === 0) {
    return (
      <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-8 text-sm text-slate-600 shadow-sm">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
        <thead className="bg-slate-50 text-slate-500">
          <tr>
            <th className="px-4 py-3 font-medium">Company</th>
            <th className="px-4 py-3 font-medium">Title</th>
            <th className="px-4 py-3 font-medium">Source</th>
            <th className="px-4 py-3 font-medium">Location</th>
            <th className="px-4 py-3 font-medium">Remote</th>
            <th className="px-4 py-3 font-medium">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {jobs.map((job) => (
            <tr key={job.id}>
              <td className="px-4 py-3">{job.companyName}</td>
              <td className="px-4 py-3 font-medium text-slate-900">
                <Link href={`/jobs/${job.id}`} className="hover:underline">
                  {job.title}
                </Link>
              </td>
              <td className="px-4 py-3 capitalize">{job.sourceKind}</td>
              <td className="px-4 py-3">{job.location || 'Unspecified'}</td>
              <td className="px-4 py-3 capitalize">{job.remoteType}</td>
              <td className="px-4 py-3 capitalize">{job.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
